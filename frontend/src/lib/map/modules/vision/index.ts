/**
 * Module « vision » de la carte (docs/carte.md § 9 et § 10, Vision) : rendu de la visibilité,
 * masquage de ce qui n'est pas vu, sélecteur « Vue » du MJ, audience du direct.
 *
 * - Joueur : obscurité à `shadowOpacity` hors de sa vue, brume dans le brouillard, lueurs des
 *   lumières ; PNJ, objets (hors décor) et icônes de porte non vus masqués (fondu de 150 ms,
 *   une porte masquée ne s'ouvre plus) ; personnages joueurs hors de sa vue au-dessus de
 *   l'ombre, à 60 % (plan `allies`). Pendant un glisser, la vue suit la position en direct
 *   (aperçu local, direct interpolé des autres).
 * - MJ : tout est visible, l'ombre des joueurs en voile léger (25 %) ; « Vue de … » : le rendu
 *   exact de ce joueur, entités non vues masquées. Les surcouches du MJ (plan `gm`) restent
 *   au-dessus de l'ombre.
 * - Direct : un PNJ ou un objet vu de certains joueurs seulement part à eux seuls (`toUsers`),
 *   un élément caché au MJ seul (vue de chaque joueur calculée ici, gardée).
 * - Relecture : `sync.ts` relit tokens et objets d'un joueur quand sa vue change (son token
 *   lâché, une porte, `map.visibility_changed`), regroupé en une relecture par 100 ms.
 *
 * État sans Pixi : `vision-state.ts` (testé à blanc) ; rendu : `renderer.ts`.
 */
import type { MapEngine, MapModule } from '../../engine/map-engine';
import { VisionViewMenu } from '@/components/map/vision/view-menu';
import { Fades, VISION_MASK } from './fades';
import { VisionRings } from './radius-rings';
import { visionPrefs } from './prefs';
import { CAMERA_REFRESH_MS, VisionRenderer } from './renderer';
import { exposeDebug, exposeStats, VisionStats } from './stats';
import { VisionState } from './vision-state';

/** Opacité des personnages joueurs hors de ma vue (plan `allies`). */
export const ALLIES_ALPHA = 0.6;
/** Cadence de l'animation de la brume (images par seconde) : une dérive lente, 10 suffisent. */
export const FOG_FPS = 10;

/**
 * Applique masques et plans forcés décidés par l'état de la visibilité ; une entité sans
 * décision (vue du MJ) est montrée et garde son plan.
 */
export function applyDecisions(engine: MapEngine, state: VisionState, fades: Fades, now: number) {
  const alive = new Set<string>();
  const decisions = state.decisions();
  for (const e of engine.entities()) {
    const d = decisions.get(e.id);
    const decided = e.kind.collection === 'tokens' || e.kind.collection === 'objects';
    // Autres sortes : seulement celles que la vision a masquées (« Vue de… ») ou masque
    if (!decided && !d && !e.masks.has(VISION_MASK)) continue;
    alive.add(e.id);
    fades.set(e, d?.masked === true, now);
    if (decided) engine.setPlaneOverride(e, d?.allies ? 'allies' : null);
  }
  fades.prune(alive);
}

export const visionModule: MapModule = {
  id: 'vision',
  register(engine) {
    const stats = new VisionStats();
    const state = new VisionState(engine, { stats });
    const fades = new Fades(engine);
    const prefs = visionPrefs(engine);
    let renderer: VisionRenderer | null = null;
    let rings: VisionRings | null = null;
    let fogClock = 0;
    let lastTick = 0;
    let fogTimer: ReturnType<typeof setTimeout> | null = null;
    // Entrées lues par `sync()` à la dernière image : inchangées, rien à refaire (ni vues, ni
    // décisions). La caméra n'en fait pas partie (seul le rendu en dépend)
    const inputs: unknown[] = [];
    const inputsChanged = () => {
      const next = [
        engine.revision,
        engine.viewer,
        engine.ui.getState().viewAs,
        engine.directory.characters(),
        engine.directory.players?.(),
      ];
      const same = inputs.length === next.length && next.every((v, i) => v === inputs[i]);
      if (!same) inputs.splice(0, inputs.length, ...next);
      return !same;
    };

    const cleanups: (() => void)[] = [
      exposeStats(stats),
      exposeDebug(() => {
        const picture = state.picture();
        const member = state.member();
        const decisions = [...state.decisions().values()];
        const tokens = engine.store.getState().collections.tokens;
        return {
          mode: state.mode,
          viewer: engine.viewer,
          member,
          directoryCharacters: engine.directory.characters().length,
          players: state.players().map((p) => ({ userId: p.userId, characterIds: p.characterIds })),
          tokens: tokens?.size ?? 0,
          observers: picture?.viewers.map((v) => ({ id: v.id, pos: v.pos })) ?? null,
          pictureVersions: picture?.versions ?? null,
          bounds: picture?.bounds ?? null,
          darkness: picture?.darkness ?? null,
          decisions: { total: decisions.length, masked: decisions.filter((d) => d.masked).length },
          renderer: renderer?.debugState() ?? null,
          mounted: engine.ui.getState().mounted,
        };
      }),
      engine.registerToolbarItem({
        id: 'vision:view',
        slot: 'view',
        order: 10,
        component: VisionViewMenu,
      }),
      // Couches sans sorte enregistrée (murs, zones…) : le moteur ne redessine pas pour elles
      engine.store.subscribe((s, prev) => {
        if (
          s.collections !== prev.collections ||
          s.scene !== prev.scene ||
          s.settings !== prev.settings
        )
          engine.invalidate();
      }),
      engine.ui.subscribe((s, prev) => {
        if (s.viewAs !== prev.viewAs) engine.invalidate();
      }),
      prefs.subscribe(() => engine.invalidate()),
    ];
    engine.setLiveAudienceResolver((e) => state.audience(e));
    cleanups.push(() => engine.setLiveAudienceResolver(null));

    // Brume animée : une image de temps en temps, seulement si elle est à l'écran
    const scheduleFog = () => {
      if (fogTimer || !renderer?.fogVisible || !prefs.getState().fogAnimation) return;
      fogTimer = setTimeout(() => {
        fogTimer = null;
        engine.invalidate();
      }, 1000 / FOG_FPS);
    };
    // Geste de caméra : la vue n'a pas été refaite à cette image, une image plus tard la refera
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSettle = () => {
      if (settleTimer) return;
      settleTimer = setTimeout(() => {
        settleTimer = null;
        engine.invalidate();
      }, CAMERA_REFRESH_MS);
    };
    cleanups.push(() => {
      if (fogTimer) clearTimeout(fogTimer);
      if (settleTimer) clearTimeout(settleTimer);
    });

    cleanups.push(
      engine.onFrame((now) => {
        const started = performance.now();
        if (inputsChanged()) {
          state.sync();
          // Vue du MJ : aucune décision, tout se remontre et retrouve son plan
          applyDecisions(engine, state, fades, now);
        }
        const fading = fades.step(now);
        if (renderer) {
          // Horloge de la brume : avance seulement quand elle est animée
          if (prefs.getState().fogAnimation && lastTick)
            fogClock += Math.min(0.25, (now - lastTick) / 1000);
          lastTick = now;
          const cam = engine.camera;
          renderer.noisePeriod = Math.max(20, engine.kindContext().pixelsPerUnit * 3);
          const stale = renderer.draw(
            state.picture(),
            {
              x: cam.x,
              y: cam.y,
              zoom: cam.zoom,
              width: cam.viewport.width,
              height: cam.viewport.height,
            },
            fogClock,
          );
          if (stale) scheduleSettle();
          scheduleFog();
        }
        rings?.draw(state.picture(), engine.camera.zoom, prefs.getState().visionRadius);
        stats.record('frame', performance.now() - started);
        return fading;
      }),
    );

    cleanups.push(
      engine.whenMounted(() => {
        const pixi = engine.pixi;
        const plane = engine.plane('vision');
        const allies = engine.plane('allies');
        const r = engine.renderer;
        const theme = engine.theme;
        if (!pixi || !plane || !r || !theme) return;
        if (allies) allies.alpha = ALLIES_ALPHA;
        try {
          renderer = new VisionRenderer(pixi, r, plane, theme, (ms) => stats.record('render', ms));
        } catch (err) {
          console.error('[carte] rendu de la visibilité impossible', err);
          renderer = null;
        }
        const adornments = engine.plane('adornments');
        if (adornments) rings = new VisionRings(pixi, adornments, theme);
        engine.invalidate();
        // Contexte WebGL perdu puis restauré (réinitialisation du GPU) : les textures de la vue
        // sont vides, on les refait toutes à l'image suivante
        const canvas = engine.canvas;
        const onRestored = () => {
          renderer?.redrawAll();
          engine.invalidate();
        };
        canvas?.addEventListener('webglcontextrestored', onRestored);
        return () => {
          canvas?.removeEventListener('webglcontextrestored', onRestored);
          renderer?.destroy();
          renderer = null;
          rings?.destroy();
          rings = null;
          if (allies) allies.alpha = 1;
        };
      }),
    );

    return () => {
      for (const c of cleanups.splice(0)) c();
      fades.reset();
      for (const e of engine.entities()) engine.setPlaneOverride(e, null);
    };
  },
};
