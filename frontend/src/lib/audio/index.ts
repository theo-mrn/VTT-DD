/**
 * Moteur audio du front (docs/audio.md § 3.8 et 4.5) : un AudioContext, un
 * mixeur, les canaux musique et ambiance synchronisés sur l'horloge du
 * serveur, les effets, la préécoute et les sons spatiaux de la carte.
 * La logique pure de synchronisation est partagée avec le service
 * (`@vtt/contracts/audio-sync`) ; ici, seulement Web Audio et YouTube.
 */
export { getAudioEngine, type AudioEngine, type EngineStatus } from './engine/engine';
export { nodeStats } from './engine/graph';
export {
  ACCEPTED_AUDIO,
  audioContentType,
  audioKeys,
  useAudioAssets,
  useAudioCatalog,
  useAudioLibrary,
  useAudioStatus,
  useCampaignAudio,
  useChannel,
  useChannelPosition,
  useMixer,
  usePreview,
  useLiveSounds,
  useSoundCues,
  useSpatialAudio,
  type SpatialSource,
} from './hooks';
export type { LiveKind, LiveSound } from './engine/registry';
