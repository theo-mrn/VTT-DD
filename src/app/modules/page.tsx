"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Blocks, BookOpen, Layout, Dices, Radio, Users, Volume2, Image as ImageIcon,
  Puzzle, ChevronDown, ChevronRight, Copy, Check, ArrowLeft, FolderTree, PackageOpen, Rocket,
} from 'lucide-react';

function CodeBlock({ children, language = 'tsx' }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
        <span>{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs leading-relaxed" style={{ background: 'var(--bg-darker)' }}>
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg" style={{ background: 'var(--bg-darker)' }}>
          <Icon size={20} style={{ color: 'var(--accent-brown)' }} />
        </div>
        <h2 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-title)' }}>{title}</h2>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}

function Collapsible({ title, subtitle, children, defaultOpen = false }: { title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-4 text-left hover:opacity-80 transition-opacity">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium text-sm">{title}</span>
        {subtitle && <span className="text-xs ml-auto font-mono" style={{ color: 'var(--text-secondary)' }}>{subtitle}</span>}
      </button>
      {open && <div className="px-4 pb-4 pt-0 space-y-3">{children}</div>}
    </div>
  );
}

function PropTable({ rows }: { rows: Array<{ name: string; type: string; desc: string }> }) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th className="text-left p-3 font-semibold">Appel</th>
            <th className="text-left p-3 font-semibold">Fichier source</th>
            <th className="text-left p-3 font-semibold">Usage réel</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'var(--bg-darker)' : 'transparent' }}>
              <td className="p-3 font-mono whitespace-nowrap">{r.name}</td>
              <td className="p-3 font-mono whitespace-nowrap" style={{ color: 'var(--accent-brown)' }}>{r.type}</td>
              <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'intro', label: 'Introduction' },
  { id: 'structure', label: 'Structure d\'un bundle' },
  { id: 'sidebar', label: 'Boutons & panneaux' },
  { id: 'dice', label: 'Définir vos dés' },
  { id: 'shared-state', label: 'État partagé (temps réel)' },
  { id: 'characters', label: 'Personnages & stats' },
  { id: 'map', label: 'Carte' },
  { id: 'sheet-audio', label: 'Fiche & audio' },
  { id: 'ship', label: 'Entités de groupe & lieux' },
  { id: 'ship-again', label: 'Tester & publier' },
];

export default function ModulesDocPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header className="border-b sticky top-0 z-10 backdrop-blur-sm" style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--bg-card) 90%, transparent)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <ArrowLeft size={20} style={{ color: 'var(--text-secondary)' }} />
            </Link>
            <Blocks size={24} style={{ color: 'var(--accent-brown)' }} />
            <div>
              <h1 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>Créer un bundle de règles</h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Construisez votre propre système de jeu — bouton sidebar, dés, état partagé, etc.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/modules/manager">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Puzzle size={14} />
                Gestionnaire
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar nav */}
        <nav className="hidden lg:block w-56 shrink-0 sticky top-24 self-start space-y-1">
          {NAV_ITEMS.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block px-3 py-1.5 rounded text-sm hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-16">

          {/* ── Introduction ── */}
          <Section id="intro" title="Introduction" icon={BookOpen}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Un <strong className="text-white">bundle</strong> est votre propre système de jeu complet — règles, dés, panneaux, boutons — packagé dans un dossier, sans toucher au code de l'app. Cette page explique comment en construire un, étape par étape. Chaque section montre le principe général puis, à titre d'illustration, comment il est mis en œuvre dans <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>starwars-bundle/</code> (un bundle déjà fonctionnel fourni avec le projet) — mais rien ne vous oblige à suivre cet exemple : remplacez-le par vos propres règles, votre propre thème, vos propres panneaux.
            </p>
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
              <p className="text-xs font-semibold text-white mb-2">Aucun build, aucun déploiement séparé</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Votre bundle est un dossier normal (<code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>table.json</code> + <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>scripts/*.tsx</code>) que vous compressez en zip et importez dans l'app. Les scripts TSX sont compilés à l'import, sans outil de build.
              </p>
            </div>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Structure ── */}
          <Section id="structure" title="Structure d'un bundle" icon={FolderTree}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Quatre dossiers/fichiers suffisent pour un bundle complet — ce n'est jamais qu'un dossier normal, zippé à la fin :
            </p>
            <pre className="text-xs p-4 rounded-lg overflow-x-auto" style={{ background: 'var(--bg-darker)', color: 'var(--text-secondary)' }}>{`mon-bundle/
├── table.json              # Vos règles : stats, races, dés à symboles, compétences...
├── assets/{images,fonts}/  # Images et polices référencées depuis table.json
├── styles/theme.css        # CSS injecté dans la salle tant que votre système est actif
└── scripts/
    └── main.tsx            # Point d'entrée — enregistre boutons, panneaux, widgets`}</pre>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>scripts/main.tsx</code> est le seul fichier obligatoire dans <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>scripts/</code> — vous pouvez tout écrire dedans, ou le découper en plusieurs fichiers importés localement (c'est ce que fait l'exemple Star Wars fourni, un dossier avec un fichier par fonctionnalité : radar, vaisseaux, mixeur audio...). Chaque fichier exporte typiquement une <strong className="text-white">factory</strong> — une fonction qui reçoit l'API du bundle et retourne un composant React, ex <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>makeMonPanel(api)</code> — que <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>main.tsx</code> importe et enregistre.
            </p>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Sidebar ── */}
          <Section id="sidebar" title="Ajouter un bouton dans la sidebar" icon={Layout}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Tout ce que votre bundle ajoute à la barre latérale (colonne, panneau flottant, ou simple bouton) passe par un seul appel, <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>ctx.register(&#123;...&#125;)</code>, dans votre <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>scripts/main.tsx</code>.
            </p>

            <Collapsible title="Un panneau classique — colonne latérale" defaultOpen>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Un onglet qui ouvre une colonne à droite de la carte : donnez-lui un id, un label, une icône, et le composant à afficher.
              </p>
              <CodeBlock>{`// scripts/main.tsx
import { Rocket } from 'lucide-react';

export default (ctx) => {
  const { api } = ctx;

  const monTab = {
    id: 'mon-panneau',
    label: 'Mon Panneau',
    icon: Rocket,
    component: makeMonPanel(api),   // votre propre composant, ou une factory importée d'un autre fichier
  };

  ctx.register({ sidebarTabs: [monTab] });
};`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple dans le bundle Star Wars fourni : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>scripts/ships.tsx</code> déclare exactement ce pattern pour son onglet "Vaisseaux".
              </p>
            </Collapsible>

            <Collapsible title="Un panneau flottant — posé sur la carte">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Ajoutez <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>floating: true</code> : le panneau se dimensionne à son contenu au lieu d'occuper une colonne pleine hauteur, et la carte reste interactive tout autour. Utile pour un mini-widget consulté en continu (radar, jauge, minuteur...).
              </p>
              <CodeBlock>{`const monTabFlottant = {
  id: 'mon-widget',
  label: 'Mon Widget',
  icon: Radar,
  component: makeMonWidget(api),
  floating: true,
  dock: 'bottom-right', // ou 'left' (défaut) — évite de masquer le centre de la carte
};`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Deux variantes dans le bundle Star Wars : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>radar.tsx</code> (ancré à gauche, par défaut) et <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>bombardement.tsx</code> (ancré en bas à droite, pour ne pas gêner le centre de l'écran).
              </p>
            </Collapsible>

            <Collapsible title="Un bouton d'action à états — pas de panneau">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour un bouton qui déclenche une action directement (pas d'onglet) : liste <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>states</code> pour un comportement cyclique (chaque clic avance à l'état suivant), ou juste <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>onClick</code> pour un bouton simple.
              </p>
              <CodeBlock>{`import { Eye, EyeOff } from 'lucide-react';

const monBouton = (api) => ({
  id: 'mode-vision',
  label: 'Mode de vision',
  states: [
    { id: 'normale', label: 'Normale', icon: Eye },
    { id: 'infrarouge', label: 'Infrarouge', icon: EyeOff },
  ],
  onClick: (state) => {
    if (state?.id === 'infrarouge') {
      api.map.setViewFlags({ revealAll: true, noShadows: true, tint: '#00ff88' });
    } else {
      api.map.resetViewFlags();
    }
  },
});

ctx.register({ sidebarActions: [monBouton(api)] });`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Le bundle Star Wars pousse ce pattern plus loin : son bouton "Vision" n'apparaît que pour une espèce donnée, en ré-enregistrant <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>sidebarActions</code> quand le personnage incarné change (via <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>api.character.subscribe</code>, voir plus bas) — utile si votre bouton doit apparaître/disparaître selon une condition de jeu.
              </p>
            </Collapsible>

            <Collapsible title="Ajouter un onglet au drawer Recherche du MJ">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Le drawer "Recherche unifiée" du MJ (où sont déjà PNJ/Objets/Sons) peut recevoir un onglet propre à votre bundle, pour glisser-déposer vos propres éléments sur la carte comme tokens.
              </p>
              <CodeBlock>{`const monDrawerTab = {
  id: 'mon-drawer-tab',
  label: 'Mes objets',
  icon: Target,
  component: makeMonDrawerPanel(api),
};

ctx.register({ searchDrawerTabs: isMJ ? [monDrawerTab] : [] });`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>deploy-ships.tsx</code> du bundle Star Wars, pour déployer un vaisseau depuis le catalogue.
              </p>
            </Collapsible>

            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <strong className="text-white">Piège à connaître</strong> : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-darker)' }}>ctx.register</code> REMPLACE chaque catégorie fournie. Regroupez tous vos <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-darker)' }}>sidebarTabs</code> dans un seul appel, sous forme d'une seule liste — un deuxième <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-darker)' }}>ctx.register(&#123; sidebarTabs: [...] &#125;)</code> écraserait le premier. Si une catégorie doit changer dynamiquement (comme un bouton conditionnel), enregistrez-la à part des catégories fixes.
              </p>
            </div>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Dice ── */}
          <Section id="dice" title="Définir vos dés" icon={Dices}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Définir des dés est une affaire de <strong className="text-white">données</strong>, pas de code : tout se passe dans <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>table.json</code>, jamais dans un script. Trois cas possibles selon le type de système que vous construisez.
            </p>

            <Collapsible title="Dés numériques classiques (d20, d6...)" defaultOpen>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Le plus simple : une stat avec <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>"isRollable": true</code> dans <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>gameSystem.stats</code> devient automatiquement lançable depuis la fiche, sans aucun code. C'est ainsi que fonctionne le système D&amp;D fourni par défaut avec l'app.
              </p>
            </Collapsible>

            <Collapsible title="Dés à symboles (systèmes narratifs)">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour un système où les dés donnent des symboles plutôt que des chiffres (succès, échec, avantage...) : déclarez chaque dé dans <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>gameSystem.symbolDice</code>, une liste de faces, où chaque face attribue des valeurs brutes à des stats libres — aucun nom de symbole n'est codé en dur dans le moteur, vous choisissez les vôtres.
              </p>
              <CodeBlock language="json">{`{
  "key": "ability",
  "label": "Aptitude",
  "faces": [
    { "values": {} },
    { "values": { "succesBrut": 1 } },
    { "values": { "succesBrut": 1, "avantageBrut": 1 } }
  ]
}`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple complet dans <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>starwars-bundle/table.json</code> — 7 dés (Aptitude, Difficulté, Maîtrise, Complication, Boost, Sétback, Force).
              </p>
            </Collapsible>

            <Collapsible title="Composer un pool de dés à partir de deux valeurs">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Règle générique pour les systèmes où le nombre de dés dépend de deux valeurs (ex Caractéristique et rang de Compétence) : déclarez <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>gameSystem.diceUpgradeRule</code> — <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>max(a,b)</code> dés au total, dont <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>min(a,b)</code> upgradés vers un meilleur dé.
              </p>
              <CodeBlock language="json">{`{
  "baseDiceKey": "ability",
  "upgradedDiceKey": "proficiency"
}`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Réagir à un jet depuis un script">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Un script ne lance pas de dés lui-même — il réagit à leurs <strong className="text-white">effets</strong>, généralement en lisant/écrivant l'état d'un personnage après coup. Exemple : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>droid.tsx</code> du bundle Star Wars applique un soin sur une stat quand le joueur choisit de l'utiliser (voir la section « Personnages & stats » pour l'appel exact).
              </p>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Shared state ── */}
          <Section id="shared-state" title="Faire communiquer les joueurs en temps réel" icon={Radio}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Dès que votre bundle a besoin qu'un joueur voie en direct ce qu'un autre (ou le MJ) fait — un signal, une jauge, un mini-jeu partagé — utilisez <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>api.sharedState</code> : une clé texte lue/écrite par tous les clients connectés, synchronisée automatiquement.
            </p>

            <Collapsible title="Lire / écrire une valeur simple" defaultOpen>
              <CodeBlock>{`// N'importe quel client s'abonne à une clé
api.sharedState.subscribe('ma-cle', (v) => {
  if (v === undefined) return;
  setValeur(v);
});

// N'importe quel client peut écrire — tous les abonnés sont notifiés
api.sharedState.set('ma-cle', true);`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>comms-mj.tsx</code> du bundle Star Wars bascule la visibilité d'un panneau chez tous les joueurs avec exactement ce pattern.
              </p>
            </Collapsible>

            <Collapsible title="Une config JSON — un état plus riche qu'un booléen">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour transmettre un objet, sérialisez-le en JSON avant l'écriture et parsez-le à la lecture.
              </p>
              <CodeBlock>{`const MA_CLE = 'ma-config';

// Celui qui programme
api.sharedState.set(MA_CLE, JSON.stringify({ frequence, message }));

// Celui qui écoute
api.sharedState.subscribe(MA_CLE, (raw) => {
  const config = raw ? JSON.parse(raw) : null;
  setConfig(config);
});`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : le scanner de fréquences du bundle Star Wars (<code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>scanner-mj.tsx</code> écrit, <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>scanner.tsx</code> lit).
              </p>
            </Collapsible>

            <Collapsible title="Un mini-jeu multijoueur complet">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour un état de jeu entier (phase, joueurs, deck, log...), utilisez une clé <strong className="text-white">dérivée dynamiquement</strong> (ex de l'id de l'interaction posée sur la carte, pour avoir une partie indépendante par table) et faites un cycle lecture → modification → écriture complet à chaque action.
              </p>
              <CodeBlock>{`const key = \`mon-jeu:\${interactionId}\`;

useEffect(() => api.sharedState.subscribe(key, (v) => {
  if (v == null) { setState(null); return; }
  try { setState(JSON.parse(v)); } catch { setState(null); }
}), [key]);

const write = (next) => api.sharedState.set(key, next == null ? null : JSON.stringify(next));

function jouerUnCoup() {
  const next = { ...state, /* ...changements... */ };
  write(next);
}`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple complet : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>sabacc.tsx</code> du bundle Star Wars (jeu de cartes), déclaré via <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>ctx.register(&#123; interactionGames: [...] &#125;)</code>. Le tour par tour limite naturellement les écritures concurrentes.
              </p>
            </Collapsible>

            <Collapsible title="Effacer une clé">
              <CodeBlock>{`api.sharedState.set('ma-cle', null);`}</CodeBlock>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Characters ── */}
          <Section id="characters" title="Lire et modifier les personnages" icon={Users}>
            <Collapsible title="Lire le personnage incarné et le contexte de jeu" defaultOpen>
              <CodeBlock>{`// S'abonner au personnage du joueur courant — rappelé à chaque changement
api.character.subscribe((character) => {
  const race = character?.Race;
  // ...
});

// L'état de jeu courant (rôle, ids), lu une fois
const { persoId, isMJ } = api.getGameState();`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : le bundle Star Wars s'en sert pour n'afficher un bouton "Vision" qu'aux personnages d'une espèce donnée.
              </p>
            </Collapsible>

            <Collapsible title="Modifier une stat — appliquer un soin ou un effet">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour un patch direct sur une stat (ex une jauge de vie), écrivez sur le document du personnage. Pour un effet <strong className="text-white">temporaire</strong> (buff/debuff), passez plutôt par le moteur de bonus — il s'intègre au calcul de stats et peut être retiré proprement à l'expiration.
              </p>
              <CodeBlock>{`// Patch direct sur une stat
await api.roomCharacters.update(characterId, { [statKey]: nextValue });

// Bonus temporaire, pris en compte par le moteur de calcul de stats
await api.characterBonuses.set(characterId, 'ma-source', { DEF: 2 }, 'Nom affiché du bonus');
// ... à l'expiration :
await api.characterBonuses.clear(characterId, 'ma-source');`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>droid.tsx</code> du bundle Star Wars applique un soin et pose des buffs à cooldown sur ce principe.
              </p>
            </Collapsible>

            <Collapsible title="Lister tous les personnages de la salle">
              <CodeBlock>{`api.roomCharacters.subscribe((allCharacters) => {
  setCharacters(allCharacters); // mis à jour en direct
});`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Notifier le joueur — toasts">
              <CodeBlock>{`api.showToast('Action réussie', { type: 'success' });
api.showToast('Une erreur est survenue', { type: 'error' });
api.showToast('Information', { type: 'info' });`}</CodeBlock>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Map ── */}
          <Section id="map" title="Interagir avec la carte" icon={ImageIcon}>
            <Collapsible title="Positions des personnages" defaultOpen>
              <CodeBlock>{`// Abonnement en direct — se met à jour à chaque déplacement
useEffect(() => api.map.subscribeCharacters((chars) => setNearby(chars)), []);

// Snapshot ponctuel, sans abonnement — pour une lecture à un instant T
const chars = api.map.getCharacters();`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemples dans le bundle Star Wars : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>radar.tsx</code> (abonnement continu) et <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>bombardement.tsx</code> (snapshot au moment de la frappe).
              </p>
            </Collapsible>

            <Collapsible title="Poser un gabarit visible sur la carte">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour dessiner une zone (ex un cercle de dégâts) visible par tous les joueurs. Convertissez d'abord un pourcentage en pixels via <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>getBackgroundSize</code>, puis posez le gabarit.
              </p>
              <CodeBlock>{`const bg = api.map.getBackgroundSize(); // { width, height } de l'image de fond
const x = (xPercent / 100) * bg.width;
const y = (yPercent / 100) * bg.height;

api.map.setMeasurement({ id: 'ma-zone', x, y, radius, color: '#ff4444' });
// ... et pour l'effacer ensuite :
api.map.clearMeasurement('ma-zone');`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : le pad de ciblage de <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>bombardement.tsx</code> dans le bundle Star Wars.
              </p>
            </Collapsible>

            <Collapsible title="Overlays permanents (coin haut-droit)">
              <CodeBlock>{`api.map.setOverlays([
  { id: 'mon-overlay', Component: makeMonOverlay(api) },
]);`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Mode de vision alternatif">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour changer temporairement ce qu'un joueur voit sur la carte (révéler le brouillard, ignorer les ombres, teinter le rendu) :
              </p>
              <CodeBlock>{`api.map.setViewFlags({ revealAll: true, noShadows: true, noFog: true, tint: '#00ff88' });
api.map.resetViewFlags(); // retour au rendu normal`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Ajouter un type de météo custom">
              <CodeBlock>{`api.map.registerWeather([
  { type: 'alerte', label: 'Alerte rouge', icon: 'Siren' },
]);`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Ajouté au picker météo natif (MJ) — le moteur (WeatherCanvas) sait déjà dessiner l'effet, vous le rendez juste sélectionnable.
              </p>
            </Collapsible>

            <Collapsible title="Nom de la scène / carte affichée">
              <CodeBlock>{`const mapName = api.map.getMapName(); // '' pour la carte principale`}</CodeBlock>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Sheet & Audio ── */}
          <Section id="sheet-audio" title="Personnaliser la fiche et l'audio" icon={Volume2}>
            <Collapsible title="Ajouter des fonds de fiche animés" defaultOpen>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Fournissez une liste de fonds ; la fiche native gère le rendu, le sélecteur, et la persistance par personnage — vous n'avez à écrire que le rendu de chaque fond.
              </p>
              <CodeBlock>{`api.sheet.setBackgrounds([
  { id: 'mon-fond', label: 'Mon fond animé', Component: MonFondBg },
  // ...
]);`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>backgrounds.tsx</code> du bundle Star Wars propose 4 fonds shader (champ d'étoiles, hyperespace...).
              </p>
            </Collapsible>

            <Collapsible title="Remplacer le mixeur audio natif">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Pour un rendu custom du panneau audio, tout en gardant le même raccourci clavier et le même bouton que le natif :
              </p>
              <CodeBlock>{`api.audio.setMixerPanel(makeMonMixer(api));`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>mixer.tsx</code> du bundle Star Wars remplace les faders par une version stylisée, en réutilisant le même canal <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>localStorage</code>/<code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>CustomEvent</code> que le composant natif.
              </p>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Group entities & locations ── */}
          <Section id="ship" title="Entités de groupe & lieux" icon={Rocket}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Deux notions génériques utiles pour beaucoup de systèmes : une <strong className="text-white">entité de groupe</strong> (un objet possédé par la table entière, pas par un personnage — un vaisseau, une base, une guilde) et des <strong className="text-white">lieux</strong> (un catalogue consultable de mondes/villes/plans).
            </p>
            <Collapsible title="Entité de groupe" defaultOpen>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Déclarez d'abord son schéma de stats dans <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>gameSystem.groupEntityLabel</code> / <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>groupEntityStats</code> (table.json), puis manipulez les instances depuis vos scripts :
              </p>
              <CodeBlock>{`// Lecture (tous)
api.groupEntities.subscribe((entities) => setEntities(entities));

// Le MJ modifie une instance
await api.groupEntities.update(entityId, { acquis: true });`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Exemple : le bundle Star Wars utilise cette mécanique pour ses vaisseaux (<code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>ships.tsx</code>, <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>deploy-ships.tsx</code>).
              </p>
            </Collapsible>

            <Collapsible title="Catalogue de lieux">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Activez d'abord <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>gameSystem.locationLabel</code> / <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>locationFields</code> dans <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>table.json</code>, puis lisez le catalogue :
              </p>
              <CodeBlock>{`api.locations.subscribe((locations) => setLieux(locations));`}</CodeBlock>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Astuce : pour un lieu sans image, vous pouvez afficher un globe 3D procédural fourni par l'app via <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>ui.RotatingEarth</code> (second argument de votre factory, ex <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>makeMonPanel(api, ui)</code>) — utilisé par <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>planet.tsx</code> dans le bundle Star Wars.
              </p>
            </Collapsible>

            <Collapsible title="Scène / secteur d'un joueur">
              <CodeBlock>{`api.scenes.subscribe(({ scenes, globalSceneId }) => {
  // utile pour afficher où se trouve réellement un joueur avant de le cibler
});`}</CodeBlock>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Publish ── */}
          <Section id="ship-again" title="Tester et publier votre bundle" icon={PackageOpen}>
            <ol className="text-sm space-y-2 list-decimal pl-5" style={{ color: 'var(--text-secondary)' }}>
              <li>Créez votre dossier <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>mon-bundle/</code> (ou partez de <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>starwars-bundle/</code> et adaptez-le).</li>
              <li>Générez le zip : <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>npm run bundle:zip -- mon-bundle</code> → produit <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>mon-bundle.zip</code> à la racine du projet.</li>
              <li>Importez ce zip depuis le panneau Export/Import, la page <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>/creer</code>, ou l'éditeur de règles.</li>
              <li>Rechargez la salle — les scripts s'exécutent au chargement, pas en live-reload.</li>
            </ol>
            <div className="rounded-lg border p-3 mt-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Un script en erreur n'empêche jamais la salle de charger (toast d'erreur uniquement, les autres scripts continuent). Ré-importer le même bundle écrase les mêmes fichiers (pas de doublons) ; renommer <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-darker)' }}>gameSystem.name</code> dans <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-darker)' }}>table.json</code> change le préfixe de stockage et laisse les anciens fichiers orphelins.
              </p>
            </div>
          </Section>

          {/* Footer */}
          <div className="pt-8 pb-16 text-center">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Chaque section renvoie, à titre d'exemple, vers <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-darker)' }}>starwars-bundle/</code> — un bundle fonctionnel fourni avec le projet, à explorer ou copier pour démarrer le vôtre.
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
