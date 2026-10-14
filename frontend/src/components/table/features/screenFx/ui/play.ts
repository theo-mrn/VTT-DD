/**
 * Joue un effet ponctuel sur l'écran de la table (Web Animations, rien à démonter) : secousse
 * de la scène, voile blanc de l'éclair, battement rouge sur les bords. Mouvements réduits :
 * ni secousse ni séisme, l'éclair et le battement restent doux.
 */
import type { OneShot } from '../state';

const reduit = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scène de la table : la carte et tout ce qui est posé dessus. */
const scene = () => document.querySelector<HTMLElement>('main');

function secousse(amplitude: number, ms: number) {
  const el = scene();
  if (!el || reduit()) return;
  const pas = Array.from({ length: 10 }, (_, i) => {
    const a = amplitude * (1 - i / 10);
    const x = (i % 2 ? -1 : 1) * a * (0.6 + Math.random() * 0.4);
    const y = (Math.random() - 0.5) * a;
    return {
      transform: `translate(${x}px, ${y}px) rotate(${(Math.random() - 0.5) * a * 0.08}deg)`,
    };
  });
  el.animate([{ transform: 'none' }, ...pas, { transform: 'none' }], {
    duration: ms,
    easing: 'ease-out',
  });
}

/** Calque plein écran le temps d'une animation, puis retiré. */
function voile(background: string, keyframes: Keyframe[], ms: number) {
  const div = document.createElement('div');
  Object.assign(div.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '45',
    pointerEvents: 'none',
    background,
    opacity: '0',
  });
  document.body.appendChild(div);
  const anim = div.animate(keyframes, { duration: ms, easing: 'ease-out' });
  anim.onfinish = () => div.remove();
}

export function playOneShot(fx: OneShot) {
  switch (fx) {
    case 'shake':
      return secousse(10, 450);
    case 'quake':
      return secousse(22, 1600);
    case 'flash':
      return voile(
        '#ffffff',
        reduit()
          ? [{ opacity: 0 }, { opacity: 0.35 }, { opacity: 0 }]
          : [
              { opacity: 0 },
              { opacity: 0.9, offset: 0.06 },
              { opacity: 0.2, offset: 0.25 },
              { opacity: 0.7, offset: 0.32 },
              { opacity: 0 },
            ],
        900,
      );
    case 'heartbeat':
      return voile(
        'radial-gradient(ellipse at center, transparent 45%, rgba(170, 0, 0, 0.75) 100%)',
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.12 },
          { opacity: 0.2, offset: 0.3 },
          { opacity: 0.9, offset: 0.42 },
          { opacity: 0, offset: 0.7 },
          { opacity: 0.8, offset: 0.82 },
          { opacity: 0 },
        ],
        2400,
      );
  }
}
