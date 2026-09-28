'use client';

/**
 * « Diagnostic du son » (replié) : ce que cet onglet sait et fait vraiment, relu chaque
 * seconde — connexion temps réel, contexte audio, état reçu de chaque canal, mixeur, et
 * chaque lecteur avec son état réel (élément, gain, dernière erreur). Sert à comparer deux
 * onglets et à comprendre un son qui ne sort pas.
 */
import { Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAudioEngine } from '@/lib/audio';
import { useRealtimeStatus } from '@/lib/realtime';

type Snapshot = ReturnType<ReturnType<typeof getAudioEngine>['diagnostics']>;

/** Bip grave et doux (196 Hz, fondu) par le moteur : la sortie Web Audio de l'onglet marche-t-elle ? */
function beepThroughEngine() {
  const engine = getAudioEngine();
  void engine.unlock();
  const ctx = engine.context();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 196;
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.35, t + 0.05);
  gain.gain.linearRampToValueAtTime(0, t + 0.6);
  osc.connect(gain);
  gain.connect(engine.bus('preview'));
  osc.start(t);
  osc.stop(t + 0.65);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Le même genre de fichier lu directement par le navigateur, hors moteur. */
function playWithoutEngine() {
  const el = new Audio('https://assets.yner.fr/Audio/lockedoor.mp3');
  el.volume = 0.6;
  void el.play().catch(() => undefined);
}

export function AudioDiagnostics() {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const realtime = useRealtimeStatus();

  useEffect(() => {
    if (!open) return;
    const read = () => setSnap(getAudioEngine().diagnostics());
    read();
    const t = setInterval(read, 1_000);
    return () => clearInterval(t);
  }, [open]);

  return (
    <details
      className="rounded-lg border border-border text-[12px]"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
        <Stethoscope className="size-3.5" aria-hidden />
        Diagnostic du son
      </summary>
      {snap && (
        <div className="flex flex-wrap justify-end gap-1 border-t border-border px-3 pt-2">
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] text-primary-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={beepThroughEngine}
          >
            Bip via le moteur
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] text-primary-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={playWithoutEngine}
          >
            Son sans le moteur
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[11px] text-primary-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(JSON.stringify({ realtime, ...snap }, null, 2))
                .catch(() => undefined)
            }
          >
            Copier le diagnostic
          </button>
        </div>
      )}
      {snap && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 font-mono text-[11px]">
          <dt className="text-subtle">Temps réel</dt>
          <dd>{realtime}</dd>
          <dt className="text-subtle">Campagne</dt>
          <dd className="truncate">{snap.campagne}</dd>
          <dt className="text-subtle">Lecture</dt>
          <dd>{snap.lecture}</dd>
          <dt className="text-subtle">Contexte audio</dt>
          <dd>{snap.contexte}</dd>
          <dt className="text-subtle">Déblocage</dt>
          <dd>
            {snap.debloquage}
            {snap.youtubeBloque ? ' · YouTube bloqué' : ''}
          </dd>
          <dt className="text-subtle">Musique</dt>
          <dd>{snap.musique}</dd>
          <dt className="text-subtle">Ambiance</dt>
          <dd>{snap.ambiance}</dd>
          <dt className="text-subtle">Effets actifs</dt>
          <dd>{snap.effetsActifs}</dd>
          <dt className="text-subtle">Mon mixeur</dt>
          <dd>{snap.mixeur}</dd>
          <dt className="text-subtle">Lecteurs</dt>
          <dd>
            {snap.voix.length === 0
              ? 'aucun'
              : snap.voix.map((v) => (
                  <p key={v.id}>
                    [{v.kind}] {v.label || v.id} · {v.sounding ? 'SONNE' : 'muet'}
                    {v.owned ? '' : ' · ORPHELIN'} · {v.detail}
                  </p>
                ))}
          </dd>
        </dl>
      )}
    </details>
  );
}
