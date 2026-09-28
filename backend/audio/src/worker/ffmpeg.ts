/**
 * Appels à ffprobe et ffmpeg (binaires de l'image du worker, épinglés) :
 * sonde du fichier, loudness intégrée et true peak (EBU R128), transcodage.
 * Rien n'est interprété par un shell : arguments passés tels quels.
 */
import { spawn } from 'node:child_process';

export class RejectError extends Error {
  /** Fichier refusé définitivement (pas de nouvelle tentative). */
  constructor(reason: string) {
    super(reason);
  }
}

const TIMEOUT_MS = 5 * 60_000;
const MAX_OUTPUT = 4 * 1024 * 1024;

function run(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      // Garde la fin : le résumé d'ebur128 est à la fin
      stderr = (stderr + d.toString()).slice(-MAX_OUTPUT);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

export interface Probe {
  codec: string;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  durationMs: number;
  formatName: string;
}

interface FfprobeOutput {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    bit_rate?: string;
    duration?: string;
    disposition?: { attached_pic?: number };
  }[];
  format?: { format_name?: string; duration?: string; bit_rate?: string };
}

/** Lecture de la sortie JSON de ffprobe ; RejectError si ce n'est pas un son simple. */
export function parseProbe(json: string, maxDurationMs: number): Probe {
  let out: FfprobeOutput;
  try {
    out = JSON.parse(json) as FfprobeOutput;
  } catch {
    throw new RejectError('Fichier illisible');
  }
  const streams = out.streams ?? [];
  const audio = streams.filter((s) => s.codec_type === 'audio');
  // Une pochette (image jointe) est tolérée ; une vraie vidéo, non
  const video = streams.filter(
    (s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1,
  );
  if (audio.length !== 1)
    throw new RejectError(audio.length ? 'Plusieurs pistes audio' : 'Aucune piste audio');
  if (video.length) throw new RejectError('Le fichier contient une vidéo');
  const a = audio[0]!;
  const seconds = Number(a.duration ?? out.format?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RejectError('Durée illisible');
  const durationMs = Math.round(seconds * 1000);
  if (durationMs > maxDurationMs)
    throw new RejectError(`Trop long : ${Math.round(maxDurationMs / 60_000)} min au plus`);
  const num = (v: string | number | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  return {
    codec: a.codec_name ?? 'inconnu',
    sampleRate: num(a.sample_rate),
    channels: num(a.channels),
    bitrate: num(a.bit_rate ?? out.format?.bit_rate),
    durationMs,
    formatName: out.format?.format_name ?? '',
  };
}

export async function probe(ffprobe: string, file: string, maxDurationMs: number): Promise<Probe> {
  const r = await run(ffprobe, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  if (r.code !== 0) throw new RejectError('Fichier audio illisible ou corrompu');
  return parseProbe(r.stdout, maxDurationMs);
}

export interface Loudness {
  /** Loudness intégrée (LUFS) ; null pour un silence. */
  integrated: number | null;
  /** True peak (dBTP) ; null pour un silence. */
  truePeak: number | null;
}

/** Résumé du filtre ebur128 (fin de la sortie d'erreur de ffmpeg). */
export function parseEbur128(stderr: string): Loudness {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const i = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary)?.[1];
  const p = /Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary)?.[1];
  const val = (s: string | undefined) => (s === undefined || s === '-inf' ? null : Number(s));
  const integrated = val(i);
  return {
    // −70 LUFS : seuil absolu, rien de mesurable
    integrated: integrated !== null && integrated > -70 ? integrated : null,
    truePeak: val(p),
  };
}

export async function loudness(ffmpeg: string, file: string): Promise<Loudness> {
  const r = await run(ffmpeg, [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-map',
    '0:a:0',
    '-filter:a',
    'ebur128=peak=true',
    '-f',
    'null',
    '-',
  ]);
  if (r.code !== 0) throw new RejectError('Fichier audio illisible ou corrompu');
  return parseEbur128(r.stderr);
}

/**
 * Gain de normalisation appliqué à la lecture (jamais au fichier) :
 * `clamp(cible − I, −12, +6)`, borné pour que le true peak résultant reste ≤ −1 dBTP.
 */
export function normalizationGain(l: Loudness, targetLufs: number): number {
  if (l.integrated === null) return 0;
  let gain = Math.max(-12, Math.min(6, targetLufs - l.integrated));
  if (l.truePeak !== null) gain = Math.min(gain, -1 - l.truePeak);
  return Math.round(Math.max(-24, Math.min(12, gain)) * 100) / 100;
}

/** Transcodage nécessaire : ni MP3 ni AAC, ou au-delà de 320 kb/s. */
export const needsTranscode = (p: Pick<Probe, 'codec' | 'bitrate'>) =>
  !['mp3', 'aac'].includes(p.codec) || (p.bitrate ?? 0) > 320_000;

/** AAC-LC 192 kb/s en M4A `+faststart` (lu partout, Safari compris), sans métadonnées. */
export async function transcode(ffmpeg: string, input: string, output: string): Promise<void> {
  const r = await run(ffmpeg, [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i',
    input,
    '-map',
    '0:a:0',
    '-vn',
    '-map_metadata',
    '-1',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output,
  ]);
  if (r.code !== 0) throw new RejectError('Conversion impossible');
}
