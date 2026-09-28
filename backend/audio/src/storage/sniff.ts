/**
 * Type réel d'un fichier audio d'après ses premiers octets (jamais d'après
 * son nom ni son type déclaré) : un fichier renommé ou un autre format est refusé (415).
 */
export type AudioFormat = 'mp3' | 'aac' | 'm4a' | 'ogg' | 'wav' | 'flac' | 'webm';

/** Types acceptés à l'envoi (déclarés par le navigateur), vers le format attendu. */
export const UPLOAD_TYPES: Record<string, readonly AudioFormat[]> = {
  'audio/mpeg': ['mp3'],
  'audio/mp3': ['mp3'],
  'audio/aac': ['aac', 'm4a'],
  'audio/mp4': ['m4a'],
  'audio/x-m4a': ['m4a'],
  'audio/m4a': ['m4a'],
  'audio/ogg': ['ogg'],
  'audio/opus': ['ogg', 'webm'],
  'audio/webm': ['webm'],
  'video/webm': ['webm'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/wave': ['wav'],
  'audio/vnd.wave': ['wav'],
  'audio/flac': ['flac'],
  'audio/x-flac': ['flac'],
};

/** Type servi pour un format (fichier gardé tel quel). */
export const FORMAT_MIME: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString('latin1');

/** Format d'après la signature ; null si ce n'est pas un format audio accepté. */
export function sniffAudio(head: Buffer): AudioFormat | null {
  if (head.length < 12) return null;
  if (ascii(head, 0, 3) === 'ID3') return 'mp3';
  if (ascii(head, 4, 8) === 'ftyp') return 'm4a';
  if (ascii(head, 0, 4) === 'OggS') return 'ogg';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WAVE') return 'wav';
  if (ascii(head, 0, 4) === 'fLaC') return 'flac';
  if (head.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  // Trame MPEG : synchro sur 11 bits ; couche 0 (bits 17-18 nuls) = ADTS (AAC)
  if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) {
    return (head[1]! & 0x06) === 0 ? 'aac' : 'mp3';
  }
  return null;
}
