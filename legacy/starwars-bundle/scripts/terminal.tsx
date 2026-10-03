// Terminal de commande — onglet flottant, esprit console impériale/de bord (boot sequence, prompt
// clignotant, sortie monospace scanlinée). GÉNÉRIQUE : les sources interrogées (Lieux, Entités de
// groupe, Règles du MJ) viennent de l'API de bundle standard + gameSystem, jamais de données codées
// en dur pour Star Wars — un autre système de jeu (autres labels, autre bestiaire...) est cherchable
// sans toucher ce fichier, seuls locationLabel/groupEntityLabel changent l'intitulé affiché. Seule
// exception volontairement propre à Star Wars : le Tableau des Primes (bounties-shared.tsx). PAS de
// panneau MJ séparé — le MJ les gère DEPUIS le terminal (commandes "prime add"/"prime edit <cible>"/
// "prime remove <cible>", réservées à isMJ) via un mini-formulaire inline (BountyForm plus bas), avec
// upload d'image réel vers R2 (/api/upload-asset, même endpoint que BackgroundSelector.tsx).
// Pas de dépendance à Fuse.js (le linker de bundle-scripts ne résout que React/lucide-react, cf
// README) : la recherche est un match substring insensible à la casse/accents sur titre+contenu.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeBounties, writeBounties, makeBountyId, type Bounty } from './bounties-shared';
import { subscribeBroadcast, sendBroadcast } from './broadcast-shared';
import {
  subscribeHackSessions, writeHackSessions, makeHackSession, buildHackSequence,
  type HackSession, type HackLineTone,
} from './hack-shared';

const ACCENT = '#ffe81f'; // jaune Star Wars (même accent que radar/scanner/bombardement)
const DIM = 'rgba(255,232,31,0.55)';

/** Couleurs concrètes des rôles de ligne de la séquence de piratage (cf HackLineTone). */
const HACK_TONE_COLOR: Record<HackLineTone, string> = {
  dim: 'rgba(255,255,255,0.32)',
  data: '#38bdf8',
  ok: '#4ade80',
  warn: '#f59e0b',
  bad: '#ff5c5c',
  accent: ACCENT,
};

const HACK_KEYFRAMES = `
@keyframes sw-hack-alert { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes sw-hack-shake {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 0); }
  75% { transform: translate(1px, 0); }
}
`;

interface Entry {
  id: string;
  category: string;   // ex 'LIEU', 'ENTITÉ', 'RÈGLE' — dérivé des labels du gameSystem
  title: string;
  body: string;        // texte aplati (description + champs), cherché ET affiché
  image?: string;
}

const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Line {
  id: number;
  kind: 'input' | 'output' | 'error';
  text: string;
  image?: string; // rendu en ASCII sous cette ligne (résultat de recherche avec image)
  /** Couleur explicite, prioritaire sur celle déduite de `kind` — la séquence de piratage colore
   *  chaque ligne individuellement (vert = OK, rouge = alerte, cyan = données, gris = bruit). */
  color?: string;
  /** Ligne affichée en gras (jalons de la séquence de piratage). */
  bold?: boolean;
}

// ── Rendu ASCII générique d'une image existante (loc.image / ent.image, quel que soit le système
// de jeu) : dessinée en HAUTE résolution sur un <canvas> hors-écran, puis chaque cellule de la
// grille de caractères est la MOYENNE (average-pooling) des pixels qu'elle couvre — un simple
// drawImage réduit directement à la taille de la grille (l'approche précédente) sous-échantillonne
// au point le plus proche selon les navigateurs et produit un bruit méconnaissable ; moyenner
// vraiment tous les pixels source de chaque cellule donne un résultat net même à faible résolution
// de grille. Aucune dépendance externe (le linker de bundle-scripts ne résout que React/
// lucide-react) — juste Canvas2D natif.
const ASCII_RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

const AsciiImage = ({ src, cols = 90 }: { src: string; cols?: number }) => {
  const [art, setArt] = useState<Array<Array<{ ch: string; color: string }>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !img.width || !img.height) return;
      // Cellule ~2:1 (largeur:hauteur) pour compenser l'aspect des caractères monospace.
      const rows = Math.max(1, Math.round((img.height / img.width) * cols * 0.48));

      // Dessin à une résolution SOURCE élevée (pas la taille de la grille) : c'est sur cette image
      // pleine définition qu'on moyenne ensuite, cellule par cellule.
      const SRC_W = 480;
      const srcH = Math.max(1, Math.round((img.height / img.width) * SRC_W));
      const canvas = document.createElement('canvas');
      canvas.width = SRC_W;
      canvas.height = srcH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, SRC_W, srcH);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, SRC_W, srcH).data;
      } catch {
        return; // image cross-origin non lisible (pas de CORS) : pas d'ASCII, texte seul reste affiché.
      }

      const grid: Array<Array<{ ch: string; color: string }>> = [];
      for (let cy = 0; cy < rows; cy++) {
        const row: Array<{ ch: string; color: string }> = [];
        const y0 = Math.floor((cy / rows) * srcH);
        const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) / rows) * srcH));
        for (let cx = 0; cx < cols; cx++) {
          const x0 = Math.floor((cx / cols) * SRC_W);
          const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) / cols) * SRC_W));
          let rSum = 0, gSum = 0, bSum = 0, aSum = 0, n = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * SRC_W + x) * 4;
              const a = data[i + 3];
              rSum += data[i] * a; gSum += data[i + 1] * a; bSum += data[i + 2] * a; aSum += a;
              n++;
            }
          }
          const alpha = n > 0 ? aSum / (n * 255) : 0;
          const r = aSum > 0 ? rSum / aSum : 0, g = aSum > 0 ? gSum / aSum : 0, b = aSum > 0 ? bSum / aSum : 0;
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const ch = alpha < 0.15 ? ' ' : ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(lum * ASCII_RAMP.length))];
          row.push({ ch, color: alpha < 0.15 ? 'transparent' : `rgb(${r | 0},${g | 0},${b | 0})` });
        }
        grid.push(row);
      }
      if (!cancelled) setArt(grid);
    };
    img.onerror = () => { if (!cancelled) setArt(null); };
    // Le bucket R2 de l'app ne renvoie pas d'en-têtes CORS (cf useBackgroundLoader.ts) : chargée
    // directement, l'image charge quand même dans un <img> nu mais TAINT le canvas — getImageData
    // lève alors une erreur de sécurité, silencieusement (rien ne s'affiche). On passe donc par le
    // proxy existant (/api/proxy-image, déjà utilisé pour ce même souci ailleurs) qui rajoute
    // Access-Control-Allow-Origin: * et rend le canvas lisible.
    const isAbsolute = /^https?:\/\//.test(src);
    img.src = isAbsolute ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
    return () => { cancelled = true; };
  }, [src, cols]);

  if (!art) return null;
  return (
    <pre style={{ margin: 0, lineHeight: 1, fontSize: 6, fontFamily: 'inherit', letterSpacing: 0 }}>
      {art.map((row, y) => (
        <div key={y} style={{ whiteSpace: 'pre' }}>
          {row.map((cell, x) => (
            <span key={x} style={{ color: cell.color }}>{cell.ch}</span>
          ))}
        </div>
      ))}
    </pre>
  );
};

const BOOT_LINES = [
  'INITIALISATION DU TERMINAL...',
  'LIAISON HOLONET... OK',
  'CHARGEMENT BASE DE DONNÉES LOCALE... OK',
];

const formFieldStyle: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: 12, padding: '5px 7px', borderRadius: 4,
  background: 'rgba(0,0,0,0.6)', border: `1px solid ${DIM}`, color: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};

const formLabelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,232,31,0.6)',
};

/** Mini-formulaire inline affiché DANS la sortie du terminal (pas un panneau séparé) — ouvert par
 *  "prime add" (draft vide) ou "prime edit <cible>" (draft = prime existante). L'upload d'image
 *  passe par le MÊME endpoint que BackgroundSelector.tsx (FormData → /api/upload-asset) : les scripts
 *  de bundle tournent avec les pleins droits de la page (README, "confiance totale"), donc un simple
 *  fetch suffit, aucune API de bundle dédiée n'était nécessaire. */
const BountyForm = ({ initial, isNew, onSave, onCancel }: {
  initial: Bounty;
  isNew: boolean;
  onSave: (b: Bounty) => void;
  onCancel: () => void;
}) => {
  const [target, setTarget] = useState(initial.target);
  const [reward, setReward] = useState(initial.reward);
  const [description, setDescription] = useState(initial.description);
  const [image, setImage] = useState(initial.image ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'Bounties');
      formData.append('type', 'image');
      const res = await fetch('/api/upload-asset', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const data = await res.json();
      setImage(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Échec de l\'envoi.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      border: `1px solid ${ACCENT}`, borderRadius: 6, padding: 10, margin: '4px 0 8px',
      background: 'rgba(255,232,31,0.04)', display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 420,
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', color: ACCENT, textTransform: 'uppercase', fontWeight: 700 }}>
        {isNew ? 'Nouvelle prime' : 'Modifier la prime'}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={formLabelStyle}>Cible</span>
        <input value={target} onChange={(e) => setTarget(e.target.value)} style={formFieldStyle} placeholder="ex : Dask Vorn" autoFocus />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={formLabelStyle}>Récompense</span>
        <input value={reward} onChange={(e) => setReward(e.target.value)} style={formFieldStyle} placeholder="ex : 15 000 crédits" />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={formLabelStyle}>Image</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              fontSize: 10, fontWeight: 700, padding: '5px 9px', borderRadius: 4, cursor: uploading ? 'default' : 'pointer',
              border: `1px solid ${DIM}`, background: 'transparent', color: ACCENT, whiteSpace: 'nowrap',
            }}
          >
            {uploading ? 'Envoi…' : image ? 'Changer' : 'Choisir un fichier'}
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {image && !uploading && (
            <img src={image} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, border: `1px solid ${DIM}` }} />
          )}
        </div>
        {uploadError && <span style={{ fontSize: 10, color: '#ff5c5c' }}>{uploadError}</span>}
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={formLabelStyle}>Description</span>
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          style={{ ...formFieldStyle, resize: 'vertical' }}
          placeholder="Dernière position connue, dangerosité, indices…"
        />
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
        <button
          type="button" onClick={onCancel}
          style={{ fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${DIM}`, background: 'transparent', color: 'rgba(255,255,255,0.6)' }}
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={!target.trim() || uploading}
          onClick={() => onSave({ ...initial, target: target.trim(), reward, description, image: image || undefined })}
          style={{
            fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 4,
            cursor: !target.trim() || uploading ? 'default' : 'pointer',
            border: 'none', background: ACCENT, color: '#0a0a0b',
            opacity: !target.trim() || uploading ? 0.5 : 1,
          }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
};

/** Fabrique le composant d'onglet — api/gameSystem capturés en closure (le rail ne passe aucune
 *  prop). isMJ change juste l'intitulé d'accueil, pas les sources interrogées : un joueur et le MJ
 *  cherchent dans les mêmes données (les Règles sont déjà écrites/gérées par le MJ en amont, via
 *  l'éditeur de règles — ce terminal ne fait qu'y lire). */
export const makeTerminalPanel = (api: any) => function TerminalPanel() {
  const [lines, setLines] = useState<Line[]>([]);
  const [booted, setBooted] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [locations, setLocations] = useState<Array<Record<string, unknown>>>([]);
  const [entities, setEntities] = useState<Array<Record<string, unknown>>>([]);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  // Formulaire de prime ouvert inline (null = pas de formulaire affiché) — remplace l'ancien panneau
  // MJ séparé : "prime add"/"prime edit <cible>" l'ouvrent, Enregistrer/Annuler le referment.
  const [bountyDraft, setBountyDraft] = useState<Bounty | null>(null);
  const [hackSessions, setHackSessions] = useState<HackSession[]>([]);
  // Séquence de piratage en train de défiler dans le flux — bascule tout le terminal en mode alerte
  // (entête clignotante, bordure/lueur rouge, léger tremblement) et bloque la saisie le temps qu'elle
  // se termine. hackAbortRef coupe la boucle d'injection si le composant est démonté en plein vol.
  const [hacking, setHacking] = useState(false);
  const hackAbortRef = useRef(false);
  useEffect(() => () => { hackAbortRef.current = true; }, []);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const { isMJ } = api.getGameState();

  useEffect(() => api.locations.subscribe(setLocations), []);
  useEffect(() => api.groupEntities.subscribe(setEntities), []);
  useEffect(() => subscribeBounties(api, setBounties), []);
  useEffect(() => subscribeHackSessions(api, setHackSessions), []);

  // Broadcast reçu : sharedState.subscribe rappelle IMMÉDIATEMENT avec la valeur déjà en base au
  // montage — sans garde, chaque joueur qui ouvre le terminal se prendrait un toast pour le dernier
  // message envoyé bien avant lui. lastSeenRef mémorise le dernier timestamp déjà notifié pour NE
  // toaster qu'un message réellement nouveau après ce montage.
  const lastSeenBroadcast = useRef<number | null>(null);
  useEffect(() => subscribeBroadcast(api, (msg) => {
    if (lastSeenBroadcast.current === null) { lastSeenBroadcast.current = msg.timestamp; return; }
    if (msg.timestamp === lastSeenBroadcast.current) return;
    lastSeenBroadcast.current = msg.timestamp;
    api.showToast(`📡 ${msg.authorName} : ${msg.text}`, { type: 'info' });
  }), []);

  // Séquence de boot — une ligne toutes les ~350ms, puis le prompt s'ouvre. `cancelled` coupe la
  // boucle si le composant est démonté avant la fin (StrictMode dev, ou un vrai unmount) ; chaque
  // ligne est ajoutée par TEXTE (pas par index) donc un montage qui a réussi à s'exécuter en entier
  // avant d'être annulé ne laisse jamais de doublon dans `lines`.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const l of BOOT_LINES) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 350));
        setLines((prev) => (prev.some((p) => p.text === l) ? prev : [...prev, { id: nextId.current++, kind: 'output', text: l }]));
      }
      if (cancelled) return;
      const readyText = 'Terminal prêt. Tapez "help" pour la liste des commandes.';
      await new Promise((r) => setTimeout(r, 250));
      setLines((prev) => (prev.some((p) => p.text === readyText) ? prev : [...prev, { id: nextId.current++, kind: 'output', text: readyText }]));
      setBooted(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [lines]);

  const locationLabel: string = api.gameSystem?.locationLabel || 'Lieu';
  const entityLabel: string = api.gameSystem?.groupEntityLabel || 'Entité';
  const locationFields: Array<{ key: string; label: string }> = api.gameSystem?.locationFields ?? [];
  const entityStats: Array<{ key: string; label: string }> = api.gameSystem?.groupEntityStats ?? [];

  // Index cherchable, recalculé quand les sources changent — reflète toujours l'état live des
  // données de la salle (un lieu ajouté par le MJ pendant la session est immédiatement trouvable).
  const index = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const loc of locations) {
      const name = String(loc.name ?? loc.id);
      const values = (loc.values ?? {}) as Record<string, unknown>;
      const extra = locationFields
        .map((f) => values[f.key] != null && values[f.key] !== '' ? `${f.label}: ${values[f.key]}` : null)
        .filter(Boolean)
        .join(' · ');
      const desc = String(loc.description ?? '');
      const image = typeof loc.image === 'string' && loc.image.trim() !== '' ? loc.image : undefined;
      out.push({
        id: `loc-${loc.id}`,
        category: locationLabel.toUpperCase(),
        title: name,
        body: [desc, extra].filter(Boolean).join('\n'),
        image,
      });
    }
    for (const ent of entities) {
      const label = String(ent.label ?? ent.id);
      const values = (ent.values ?? {}) as Record<string, unknown>;
      const extra = entityStats
        .map((s) => values[s.key] != null && values[s.key] !== '' ? `${s.label}: ${values[s.key]}` : null)
        .filter(Boolean)
        .join(' · ');
      const image = typeof ent.image === 'string' && ent.image.trim() !== '' ? ent.image : undefined;
      out.push({
        id: `ent-${ent.id}`,
        category: entityLabel.toUpperCase(),
        title: label,
        body: [extra, ent.acquis ? '(acquis par le groupe)' : '(catalogue)'].filter(Boolean).join('\n'),
        image,
      });
    }
    for (const rule of api.gameSystem?.rules ?? []) {
      out.push({
        id: `rule-${rule.title}`,
        category: 'RÈGLE',
        title: String(rule.title ?? ''),
        body: String(rule.description ?? ''),
      });
    }
    for (const b of bounties) {
      const extra = b.reward ? `Récompense: ${b.reward}` : '';
      out.push({
        id: `bounty-${b.id}`,
        category: 'PRIME',
        title: b.target || '(cible inconnue)',
        body: [extra, b.description].filter(Boolean).join('\n'),
        image: b.image,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, entities, bounties, locationLabel, entityLabel]);

  const print = (text: string, kind: Line['kind'] = 'output', image?: string) =>
    setLines((prev) => [...prev, { id: nextId.current++, kind, text, image }]);

  const runSearch = (term: string) => {
    const q = norm(term.trim());
    if (!q) { print('Usage : search <terme>', 'error'); return; }
    const results = index.filter((e) => norm(e.title).includes(q) || norm(e.body).includes(q));
    if (results.length === 0) {
      print(`Aucun résultat pour « ${term} ».`);
      return;
    }
    print(`${results.length} résultat(s) pour « ${term} » :`);
    for (const r of results.slice(0, 12)) {
      print(`\n[${r.category}] ${r.title}${r.body ? `\n  ${r.body.split('\n').join('\n  ')}` : ''}`, 'output', r.image);
    }
    if (results.length > 12) print(`\n… et ${results.length - 12} de plus. Affinez le terme.`);
  };

  const runList = (arg: string) => {
    const want = norm(arg.trim());
    const groups = new Map<string, Entry[]>();
    for (const e of index) {
      if (want && !norm(e.category).includes(want)) continue;
      if (!groups.has(e.category)) groups.set(e.category, []);
      groups.get(e.category)!.push(e);
    }
    if (groups.size === 0) { print(want ? `Aucune catégorie « ${arg} ».` : 'Base de données vide.'); return; }
    for (const [cat, entries] of groups) {
      print(`\n[${cat}] (${entries.length})`);
      for (const e of entries) print(`  · ${e.title}`);
    }
  };

  // "prime add" / "prime edit <cible>" / "prime remove <cible>" — réservées au MJ (c'est lui qui
  // remplit le tableau des primes) ; un joueur reste en lecture seule via search/list, comme les
  // autres sources. add/edit ouvrent le formulaire inline (BountyForm), remove agit directement.
  const runPrime = (arg: string) => {
    if (!isMJ) { print('Commande réservée au MJ.', 'error'); return; }
    const [sub, ...rest] = arg.trim().split(/\s+/);
    const name = rest.join(' ').trim();
    if (sub === 'add') {
      setBountyDraft({ id: makeBountyId(), target: '', reward: '', description: '' });
      return;
    }
    if (sub === 'edit') {
      const found = bounties.find((b) => norm(b.target) === norm(name));
      if (!found) { print(`Aucune prime nommée « ${name} ». Tapez "list prime" pour voir les cibles.`, 'error'); return; }
      setBountyDraft(found);
      return;
    }
    if (sub === 'remove') {
      const found = bounties.find((b) => norm(b.target) === norm(name));
      if (!found) { print(`Aucune prime nommée « ${name} ».`, 'error'); return; }
      writeBounties(api, bounties.filter((b) => b.id !== found.id));
      print(`Prime « ${found.target} » supprimée.`);
      return;
    }
    print('Usage : prime add | prime edit <cible> | prime remove <cible>', 'error');
  };

  const saveBounty = (b: Bounty) => {
    const exists = bounties.some((x) => x.id === b.id);
    const next = exists ? bounties.map((x) => (x.id === b.id ? b : x)) : [...bounties, b];
    writeBounties(api, next);
    setBountyDraft(null);
    print(`Prime « ${b.target} » enregistrée.`);
  };

  // "status" — fiche express du personnage incarné : toutes les stats category='vital' (PV,
  // Stress...), bornées par leur maxFormula quand elle référence directement une autre stat (même
  // résolution que resolveVitalStat dans bombardement.tsx). Générique à tout système de jeu : aucune
  // clé de stat n'est codée en dur, seule la CATÉGORIE 'vital' du schéma est utilisée.
  const runStatus = async () => {
    const c = await api.character.get();
    if (!c) { print('Aucun personnage incarné.'); return; }
    print(String(c.Nomperso ?? '(sans nom)'));
    const vitalStats = (api.gameSystem?.stats ?? []).filter((s: any) => s.category === 'vital');
    if (vitalStats.length === 0) { print('(aucune stat vitale configurée pour ce système)'); return; }
    for (const stat of vitalStats) {
      const current = Number((c as Record<string, unknown>)[stat.key] ?? 0);
      const maxKey = stat.maxFormula?.type === 'stat' ? stat.maxFormula.key : null;
      const max = maxKey ? Number((c as Record<string, unknown>)[maxKey]) : NaN;
      print(`  ${stat.label} : ${current}${!isNaN(max) ? ` / ${max}` : ''}`);
    }
  };

  // "broadcast <message>" — ouvert à TOUS (joueurs et MJ) : un simple toast reçu par tout le monde
  // (api.showToast n'est pas partagé, cf broadcast-shared.tsx pour le canal qui le rend commun).
  const runBroadcast = async (arg: string) => {
    const text = arg.trim();
    if (!text) { print('Usage : broadcast <message>', 'error'); return; }
    const c = await api.character.get();
    const authorName = String((c as Record<string, unknown> | null)?.Nomperso ?? (isMJ ? 'MJ' : 'Inconnu'));
    await sendBroadcast(api, authorName, text);
    print('Message diffusé.');
  };

  // "hack" — l'issue est tirée et VERROUILLÉE avant la première ligne affichée (cf makeHackSession,
  // hack-shared.tsx) : la session part dans le canal partagé immédiatement, donc visible du MJ
  // ("hacklog") avant même que la séquence commence à défiler — impossible à falsifier après coup.
  // La séquence elle-même s'écrit ligne à ligne DANS LE FLUX du terminal (pas de panneau séparé),
  // au rythme porté par chaque ligne (rafales rapides, pauses de suspense avant les jalons), pendant
  // que le terminal passe en mode alerte (cf `hacking` dans le rendu).
  const runHack = async () => {
    if (hacking) return; // déjà une séquence en cours
    const c = await api.character.get();
    const authorName = String((c as Record<string, unknown> | null)?.Nomperso ?? 'Inconnu');
    const session = makeHackSession(authorName);
    await writeHackSessions(api, [...hackSessions, session]);

    const sequence = buildHackSequence(session.status === 'reussi');
    setHacking(true);
    hackAbortRef.current = false;
    for (const line of sequence) {
      if (hackAbortRef.current) break;
      setLines((prev) => [...prev, {
        id: nextId.current++, kind: 'output', text: line.text,
        color: HACK_TONE_COLOR[line.tone], bold: line.bold,
      }]);
      if (line.delay > 0) await new Promise((r) => setTimeout(r, line.delay));
    }
    setHacking(false);
  };

  // "hacklog [n]" — MJ uniquement : les n dernières sessions (par défaut 5), pour vérifier une
  // réussite/un échec annoncé par un joueur (cf commentaire de hack-shared.tsx).
  const runHackLog = (arg: string) => {
    if (!isMJ) { print('Commande réservée au MJ.', 'error'); return; }
    const n = Math.max(1, Number(arg.trim()) || 5);
    const recent = [...hackSessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, n);
    if (recent.length === 0) { print('Aucune session de piratage enregistrée.'); return; }
    for (const s of recent) {
      print(`\n${s.authorName} — ${s.status === 'reussi' ? 'RÉUSSI' : 'ÉCHOUÉ'}`);
    }
  };

  const commands: Record<string, (arg: string) => void> = {
    help: () => {
      print('Commandes disponibles :');
      print('  help               — cette liste');
      print('  search <terme>     — cherche dans toute la base (lieux, entités, règles, primes)');
      print(`  list [catégorie]   — liste les entrées (ex: list prime, list ${locationLabel.toLowerCase()})`);
      print('  whoami             — votre personnage incarné');
      print('  status             — stats vitales de votre personnage');
      print('  broadcast <msg>    — diffuse un message (toast) à tous');
      print('  hack               — tenter un piratage (séquence d\'intrusion)');
      print('  clear              — efface l\'écran');
      if (isMJ) {
        print('  prime add                — ajouter une prime (formulaire)');
        print('  prime edit <cible>       — modifier une prime existante');
        print('  prime remove <cible>     — supprimer une prime');
        print('  hacklog [n]              — dernières sessions de piratage (vérification)');
      }
    },
    search: runSearch,
    list: runList,
    prime: runPrime,
    status: runStatus,
    broadcast: runBroadcast,
    hack: runHack,
    hacklog: runHackLog,
    whoami: async () => {
      const c = await api.character.get();
      if (!c) { print('Aucun personnage incarné.'); return; }
      print(`${c.Nomperso ?? '(sans nom)'}`);
    },
    clear: () => setLines([]),
  };

  const execute = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    print(`> ${trimmed}`, 'input');
    setHistory((prev) => [...prev, trimmed]);
    setHistIdx(null);
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const handler = commands[cmd.toLowerCase()];
    if (!handler) {
      print(`Commande inconnue : ${cmd}. Tapez "help".`, 'error');
      return;
    }
    handler(rest.join(' '));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    execute(input);
    setInput('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx === null) return;
      const next = histIdx + 1;
      if (next >= history.length) { setHistIdx(null); setInput(''); }
      else { setHistIdx(next); setInput(history[next]); }
    }
  };

  const formBlocking = !!bountyDraft || hacking;
  // Mode alerte : pendant une séquence de piratage, TOUT le terminal change d'aspect (bordure et
  // lueur rouges, entête en alerte clignotante, parasites par-dessus les scanlines, tremblement).
  const alertColor = '#ff5c5c';

  return (
    <div
      onClick={() => { if (!formBlocking) inputRef.current?.focus(); }}
      style={{
        width: 720, height: 520, display: 'flex', flexDirection: 'column',
        background: 'rgba(3,3,4,0.92)', borderRadius: 6,
        border: `1px solid ${hacking ? alertColor : DIM}`,
        boxShadow: hacking
          ? `0 0 34px rgba(255,92,92,0.28), inset 0 0 60px rgba(80,0,0,0.35)`
          : `0 0 24px rgba(255,232,31,0.08), inset 0 0 40px rgba(0,0,0,0.5)`,
        fontFamily: 'monospace', overflow: 'hidden', position: 'relative',
        animation: hacking ? 'sw-hack-shake 0.35s linear infinite' : undefined,
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <style>{HACK_KEYFRAMES}</style>

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, transparent 1px, transparent 2px)',
      }} />

      {/* Parasites — uniquement pendant le piratage, par-dessus tout le contenu */}
      {hacking && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0.5,
          background: 'repeating-linear-gradient(0deg, rgba(255,92,92,0.06) 0 2px, transparent 2px 5px)',
        }} />
      )}

      {/* Barre de titre */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderBottom: `1px solid ${hacking ? alertColor : DIM}`, flexShrink: 0,
        background: hacking ? 'rgba(80,0,0,0.25)' : undefined,
        transition: 'background 0.3s, border-color 0.3s',
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: hacking ? alertColor : ACCENT,
          boxShadow: `0 0 6px ${hacking ? alertColor : ACCENT}`,
          animation: hacking ? 'sw-hack-alert 0.6s ease-in-out infinite' : undefined,
        }} />
        <span style={{
          fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: hacking ? alertColor : ACCENT, fontWeight: hacking ? 700 : undefined,
          animation: hacking ? 'sw-hack-alert 0.6s ease-in-out infinite' : undefined,
        }}>
          {hacking ? '// intrusion en cours //' : 'Terminal'}
        </span>
      </div>

      {/* Sortie */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lines.map((l) => (
          <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {l.image && (
              <div style={{ flexShrink: 0 }}>
                <AsciiImage src={l.image} cols={44} />
              </div>
            )}
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1, minWidth: 0,
              fontSize: 11.5, lineHeight: 1.45, fontFamily: 'inherit',
              fontWeight: l.bold ? 700 : undefined,
              color: l.color ?? (l.kind === 'error' ? '#ff5c5c' : l.kind === 'input' ? '#fff' : 'rgba(255,232,31,0.85)'),
            }}>
              {l.text}
            </pre>
          </div>
        ))}
        {bountyDraft && (
          <BountyForm
            initial={bountyDraft}
            isNew={!bounties.some((b) => b.id === bountyDraft.id)}
            onCancel={() => { setBountyDraft(null); print('Annulé.'); }}
            onSave={saveBounty}
          />
        )}
      </div>

      {/* Ligne de commande — bloquée pendant un formulaire ouvert ou une séquence de piratage. */}
      <form onSubmit={onSubmit} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flexShrink: 0,
        borderTop: `1px solid ${hacking ? alertColor : DIM}`, transition: 'border-color 0.3s',
      }}>
        <span style={{ color: hacking ? alertColor : ACCENT, fontSize: 12 }}>&gt;</span>
        <input
          ref={inputRef}
          value={input}
          disabled={!booted || formBlocking}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={hacking ? 'intrusion en cours…' : bountyDraft ? 'formulaire en cours…' : booted ? '' : '…'}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', fontSize: 12, fontFamily: 'inherit', caretColor: ACCENT,
          }}
        />
      </form>
    </div>
  );
};
