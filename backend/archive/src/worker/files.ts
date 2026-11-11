/** Types de fichiers repris d'une archive : ceux qu'acceptent les envois (images, vidéos, sons). */
import { UPLOAD_EXTENSIONS, UPLOAD_MAP_IMAGE_TYPES, UPLOAD_VIDEO_TYPES } from '@vtt/contracts';

const AUDIO: Record<string, string[]> = {
  'audio/mpeg': ['mp3'],
  'audio/ogg': ['ogg', 'oga'],
  'audio/opus': ['opus'],
  'audio/webm': ['weba'],
  'audio/wav': ['wav'],
  'audio/flac': ['flac'],
  'audio/aac': ['aac'],
  'audio/mp4': ['m4a'],
};

const BY_TYPE = new Map<string, string[]>([
  ...[...UPLOAD_MAP_IMAGE_TYPES, ...UPLOAD_VIDEO_TYPES].map(
    (t) => [t, t === 'image/jpeg' ? ['jpg', 'jpeg'] : [UPLOAD_EXTENSIONS[t]]] as [string, string[]],
  ),
  ...Object.entries(AUDIO),
]);

/**
 * Type sûr d'un fichier : le type annoncé s'il est accepté, sinon celui de son extension ; null
 * pour tout autre fichier (jamais de HTML, de SVG ni d'exécutable servi depuis notre domaine).
 */
export function safeContentType(key: string, declared: string | null | undefined): string | null {
  const type = declared?.split(';')[0]?.trim().toLowerCase();
  if (type && BY_TYPE.has(type)) return type;
  const ext = key.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  for (const [t, exts] of BY_TYPE) if (exts.includes(ext)) return t;
  return null;
}
