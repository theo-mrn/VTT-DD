/**
 * Applique un réglage (client du MJ) : chaque paramètre présent est appliqué, les autres ne
 * sont pas touchés. Son : canal lancé (playlist ou piste) ou coupé ; météo : sur la scène
 * visée ; écran : ambiance qui dure, effet ponctuel ; temps du monde : prochaine occurrence de
 * l'heure, vitesse. Aussi : la capture de l'ambiance en cours, pour remplir un réglage.
 */
import type {
  AutomationParams,
  AutomationTrack,
  ChannelName,
  ChannelState,
  MapWeather,
} from '@vtt/contracts';
import { audioApi } from '@/lib/audio/api';
import { getAudioEngine } from '@/lib/audio/engine/engine';
import { activeMapStore } from '@/lib/map/active-map';
import { mapsApi } from '@/lib/map/api';
import { triggerOneShot } from '../screenFx/send';
import { mood } from '../screenFx/state';
import { currentMinutes, nextHour, updateWorldTime, worldTime } from '../worldTime/state';

const CHANNELS: readonly ChannelName[] = ['music', 'ambience'];

const memePiste = (s: ChannelState, t: AutomationTrack) =>
  s.status === 'playing' &&
  (t.playlistId ? s.playlistId === t.playlistId : !s.playlistId && s.track?.id === t.assetId);

export async function applyAutomation(
  campaignId: string,
  params: AutomationParams,
  /** Scène dont la météo change ; absente : la scène ouverte par le MJ. */
  mapId?: string | null,
) {
  const engine = getAudioEngine();
  const sons = CHANNELS.filter((ch) => params[ch] !== undefined);
  if (sons.length) {
    const { channels } = await audioApi.channels(campaignId);
    await Promise.all(
      sons.map(async (ch) => {
        const voulu = params[ch];
        const actuel = channels[ch];
        if (voulu) {
          // La même musique déjà en cours n'est pas relancée
          if (memePiste(actuel, voulu)) return;
          engine.applyChannel(
            await audioApi.command(campaignId, ch, {
              type: 'play',
              ...(voulu.playlistId
                ? { playlistId: voulu.playlistId }
                : { assetId: voulu.assetId! }),
            }),
          );
        } else if (actuel.status !== 'stopped')
          engine.applyChannel(await audioApi.command(campaignId, ch, { type: 'stop' }));
      }),
    );
  }

  if (params.weather !== undefined) {
    const cible = mapId ?? activeMapStore.getState().mapId;
    if (cible) await mapsApi.update(campaignId, cible, { weather: params.weather });
  }

  if (params.mood !== undefined) mood.set(params.mood);
  if (params.effect) triggerOneShot(params.effect);

  const time = params.time;
  if (time && (time.hour !== undefined || time.rate !== undefined)) {
    const t = worldTime.store.getState().value;
    if (t) {
      const maintenant = currentMinutes(t);
      updateWorldTime(t, {
        ...(time.hour !== undefined
          ? { minutes: nextHour(Math.floor(maintenant), time.hour) }
          : {}),
        ...(time.rate !== undefined ? { rate: time.rate } : {}),
      });
    } else
      worldTime.set({
        minutes: (time.hour ?? 8) * 60,
        visible: true,
        rate: time.rate ?? 0,
        since: Date.now(),
      });
  }
}

const pisteDe = (s: ChannelState): AutomationTrack | null =>
  s.status !== 'playing'
    ? null
    : s.playlistId
      ? { playlistId: s.playlistId, assetId: null }
      : s.track
        ? { playlistId: null, assetId: s.track.id }
        : null;

/** L'ambiance en cours : son, météo de la scène ouverte, ambiance d'écran. */
export async function captureAutomation(campaignId: string): Promise<AutomationParams> {
  const { channels } = await audioApi.channels(campaignId);
  const scene = activeMapStore.getState().engine?.store.getState().scene;
  return {
    music: pisteDe(channels.music),
    ambience: pisteDe(channels.ambience),
    weather: (scene?.weather as MapWeather | null | undefined) ?? null,
    mood: mood.store.getState().value,
  };
}
