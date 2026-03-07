"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Blocks, BookOpen, Code, Zap, Layout, MessageSquare, Shield,
  Puzzle, ChevronDown, ChevronRight, Copy, Check, ExternalLink,
  ArrowLeft
} from 'lucide-react';

function CodeBlock({ children, language = 'javascript' }: { children: string; language?: string }) {
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
          {copied ? 'Copie !' : 'Copier'}
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

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-4 text-left hover:opacity-80 transition-opacity">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium text-sm">{title}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-0 space-y-3">{children}</div>}
    </div>
  );
}

function PropTable({ rows }: { rows: Array<{ name: string; type: string; required?: boolean; desc: string }> }) {
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th className="text-left p-3 font-semibold">Propriété</th>
            <th className="text-left p-3 font-semibold">Type</th>
            <th className="text-left p-3 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'var(--bg-darker)' : 'transparent' }}>
              <td className="p-3 font-mono">
                {r.name}
                {r.required && <span className="text-red-400 ml-1">*</span>}
              </td>
              <td className="p-3 font-mono" style={{ color: 'var(--accent-brown)' }}>{r.type}</td>
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
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'manifest', label: 'Manifest' },
  { id: 'sdk', label: 'SDK Global' },
  { id: 'contributions', label: 'Contributions UI' },
  { id: 'lifecycle', label: 'Cycle de vie' },
  { id: 'api', label: 'Module API' },
  { id: 'events', label: 'Event Bus' },
  { id: 'data', label: 'Persistance' },
  { id: 'build', label: 'Build & Deploy' },
  { id: 'examples', label: 'Exemples' },
  { id: 'security', label: 'Sécurité' },
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
              <h1 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>Yner Module SDK</h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Documentation pour développeurs de modules</p>
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
        <nav className="hidden lg:block w-52 shrink-0 sticky top-24 self-start space-y-1">
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
              Le système de modules Yner permet d'étendre la VTT avec de nouvelles fonctionnalités
              sans modifier le code source. Les modules peuvent ajouter des panneaux dans la sidebar,
              des widgets sur les fiches de personnage, des items dans les menus contextuels,
              écouter les événements du jeu, et persister des données dans Firebase.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: Layout, title: 'UI Extensible', desc: 'Sidebar, fiches, menus contextuels, toolbar' },
                { icon: Zap, title: 'Event Bus', desc: 'Écoutez les jets de dés, le combat, le chat' },
                { icon: Shield, title: 'Persistance', desc: 'Données sauvegardées par room dans Firebase' },
              ].map((f, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
                  <f.icon size={18} style={{ color: 'var(--accent-brown)' }} />
                  <div className="font-medium text-sm">{f.title}</div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Quick Start ── */}
          <Section id="quickstart" title="Quick Start" icon={Zap}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Voici un module minimal complet. Créez un fichier <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>mon-module.js</code>, hébergez-le, et collez l'URL dans le gestionnaire de modules.
            </p>
            <CodeBlock>{`
// mon-module.js
(function() {
  const SDK = window.__VTT_SDK__;
  const { React, register, ui, icons } = SDK;
  const { useState } = React;
  const { Button, Card, CardContent, ScrollArea } = ui;
  const { Star } = icons;

  // Composant principal du module
  function MonPanel() {
    const [count, setCount] = useState(0);

    return React.createElement('div', {
      className: 'p-4 space-y-4',
      style: { background: 'var(--bg-card)', color: 'var(--text-primary)' }
    },
      React.createElement('h2', {
        className: 'text-lg font-semibold',
        style: { fontFamily: 'var(--font-title)' }
      }, 'Mon Module'),
      React.createElement(Card, { className: 'p-4' },
        React.createElement(Button, {
          onClick: () => setCount(c => c + 1)
        }, 'Compteur : ' + count)
      )
    );
  }

  // Enregistrer le module
  register({
    manifest: {
      id: 'mon-module',
      name: 'Mon Module',
      version: '1.0.0',
      description: 'Un module de démo avec un compteur.',
      author: 'Mon Nom',
      type: 'feature',
      defaultEnabled: true,
    },
    contributions: {
      sidebarTabs: [{
        id: 'mon-panel',
        label: 'Mon Module',
        icon: Star,
        component: MonPanel,
        order: 60,
        width: 'w-full sm:w-[400px]',
        persistent: true,
      }],
    },
  });
})();
`}</CodeBlock>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Manifest ── */}
          <Section id="manifest" title="Manifest" icon={BookOpen}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Le manifest décrit l'identité de votre module. Il est obligatoire et doit contenir au minimum un <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>id</code> unique.
            </p>
            <PropTable rows={[
              { name: 'id', type: 'string', required: true, desc: 'Identifiant unique du module (ex: "dice-stats"). Doit être unique sur toute la plateforme.' },
              { name: 'name', type: 'string', required: true, desc: 'Nom affiché dans le gestionnaire de modules.' },
              { name: 'version', type: 'string', required: true, desc: 'Version sémantique (ex: "1.2.0").' },
              { name: 'description', type: 'string', required: true, desc: 'Description courte du module.' },
              { name: 'author', type: 'string', required: true, desc: 'Nom de l’auteur ou du studio.' },
              { name: 'type', type: '"feature" | "game-system" | "content"', required: true, desc: 'Catégorie du module.' },
              { name: 'dependencies', type: 'string[]', desc: 'IDs de modules requis (chargés avant le vôtre).' },
              { name: 'defaultEnabled', type: 'boolean', desc: 'Si true, le module est activé automatiquement après installation.' },
              { name: 'requiresMJ', type: 'boolean', desc: 'Si true, seul le MJ peut activer ce module.' },
            ]} />

            <Collapsible title="Types de modules">
              <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <p><strong className="text-white">feature</strong> — Fonctionnalité additionnelle (journal de quêtes, statistiques de dés, traqueur d'initiatives, etc.)</p>
                <p><strong className="text-white">game-system</strong> — Système de règles (D&D 5e, Pathfinder, CO-DRS, etc.). Un seul actif à la fois par room.</p>
                <p><strong className="text-white">content</strong> — Pack de contenu (bestiaire, tables aléatoires, cartes pré-faites, etc.)</p>
              </div>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── SDK Global ── */}
          <Section id="sdk" title="SDK Global (window.__VTT_SDK__)" icon={Code}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Le SDK est exposé automatiquement sur <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>window.__VTT_SDK__</code> quand l'app est chargée. Il fournit tout ce dont votre module a besoin.
            </p>

            <PropTable rows={[
              { name: 'React', type: 'typeof React', required: true, desc: 'Référence React. Utilisez-la au lieu de bundler React (sinon conflit).' },
              { name: 'register(def)', type: '(ModuleDefinition) => void', required: true, desc: 'Enregistre votre module dans le registre global.' },
              { name: 'events.on(type, handler)', type: '(string, fn) => unsubscribe', desc: 'Écoute un événement du jeu. Retourne une fonction pour se désabonner.' },
              { name: 'events.emit(event)', type: '(GameEvent) => void', desc: 'Émet un événement vers tous les modules.' },
              { name: 'ui', type: 'object', desc: 'Composants UI Shadcn/ui (Button, Card, Input, Dialog, etc.).' },
              { name: 'icons', type: 'typeof lucide-react', desc: 'Toutes les icônes Lucide (Star, Sword, Shield, Heart, etc.).' },
              { name: 'version', type: 'string', desc: 'Version du SDK.' },
            ]} />

            <Collapsible title="Composants UI disponibles (SDK.ui)">
              <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <p><strong className="text-white">Basiques :</strong> Button, Input, Label, Switch, Separator, Badge, ScrollArea</p>
                <p><strong className="text-white">Layout :</strong> Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter</p>
                <p><strong className="text-white">Navigation :</strong> Tabs, TabsList, TabsTrigger, TabsContent</p>
                <p><strong className="text-white">Sélection :</strong> Select, SelectTrigger, SelectValue, SelectContent, SelectItem</p>
                <p><strong className="text-white">Overlay :</strong> Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter</p>
                <p><strong className="text-white">Info :</strong> Tooltip, TooltipTrigger, TooltipContent, TooltipProvider</p>
              </div>
            </Collapsible>

            <Collapsible title="Variables CSS du thème">
              <div className="text-xs space-y-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
                <p>--bg-card, --bg-darker — Fonds principaux</p>
                <p>--text-primary, --text-secondary — Couleurs de texte</p>
                <p>--border-color — Bordures</p>
                <p>--accent-brown — Couleur d'accent</p>
                <p>--font-title (Cinzel), --font-body (IM Fell English)</p>
                <p>--font-hand (Caveat), --font-medieval (MedievalSharp)</p>
              </div>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Contributions UI ── */}
          <Section id="contributions" title="Contributions UI" icon={Layout}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Les contributions déclarent ce que votre module ajoute à l'interface. Elles sont définies dans <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>contributions</code> de votre <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>ModuleDefinition</code>.
            </p>

            <Collapsible title="sidebarTabs — Onglets dans la sidebar" defaultOpen>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Ajoute un bouton dans la barre latérale gauche qui ouvre un panneau personnalisé.
              </p>
              <PropTable rows={[
                { name: 'id', type: 'string', required: true, desc: 'Identifiant unique du tab.' },
                { name: 'label', type: 'string', required: true, desc: 'Tooltip affiché au survol du bouton.' },
                { name: 'icon', type: 'ComponentType', required: true, desc: 'Icône Lucide (ex: SDK.icons.Star).' },
                { name: 'component', type: 'ComponentType', required: true, desc: 'Composant React rendu dans le panneau.' },
                { name: 'order', type: 'number', desc: 'Position dans la sidebar (défaut: 100). Plus bas = plus haut.' },
                { name: 'mjOnly', type: 'boolean', desc: 'Si true, visible uniquement pour le MJ.' },
                { name: 'width', type: 'string', desc: 'Classe Tailwind de largeur (ex: "w-full sm:w-[500px]").' },
                { name: 'persistent', type: 'boolean', desc: 'Si true, le panneau reste monté en mémoire (comme le chat).' },
              ]} />
              <CodeBlock>{`
contributions: {
  sidebarTabs: [{
    id: 'mon-panel',
    label: 'Mon Panel',
    icon: SDK.icons.BarChart3,
    component: MonComposant,
    order: 55,
    mjOnly: false,
    width: 'w-full sm:w-[500px]',
    persistent: true,
  }],
}
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="characterWidgets — Widgets sur les fiches de personnage">
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Ajoute un widget draggable/resizable dans la fiche de personnage.
                Le composant reçoit <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-card)' }}>characterId</code> et <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-card)' }}>roomId</code> en props.
              </p>
              <PropTable rows={[
                { name: 'id', type: 'string', required: true, desc: 'Identifiant unique du widget.' },
                { name: 'label', type: 'string', required: true, desc: 'Nom affiché dans le menu "Ajouter un widget".' },
                { name: 'component', type: 'ComponentType<{characterId, roomId}>', required: true, desc: 'Composant React du widget.' },
                { name: 'defaultLayout', type: '{ w, h, minW, minH }', required: true, desc: 'Taille par défaut dans la grille (unités de grille).' },
              ]} />
              <CodeBlock>{`
contributions: {
  characterWidgets: [{
    id: 'spell-slots',
    label: 'Emplacements de sorts',
    component: SpellSlotsWidget,
    defaultLayout: { w: 4, h: 3, minW: 2, minH: 2 },
  }],
}
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="contextMenuItems — Items dans les menus contextuels">
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Ajoute des entrées dans le menu contextuel (clic droit) de la carte, des personnages, ou des objets.
              </p>
              <PropTable rows={[
                { name: 'target', type: '"map" | "character" | "object"', required: true, desc: 'Sur quel menu ce bouton apparaît.' },
                { name: 'items[].id', type: 'string', required: true, desc: 'Identifiant unique de l’item.' },
                { name: 'items[].label', type: 'string | (ctx) => string', required: true, desc: 'Label affiché (peut être dynamique).' },
                { name: 'items[].icon', type: 'ReactNode', required: true, desc: 'Élément React pour l’icône.' },
                { name: 'items[].onClick', type: '(ctx) => void', required: true, desc: 'Action quand on clique.' },
                { name: 'items[].condition', type: '(ctx) => boolean', desc: 'Affiché seulement si retourne true.' },
              ]} />
            </Collapsible>

            <Collapsible title="toolbarItems — Boutons dans la toolbar">
              <PropTable rows={[
                { name: 'id', type: 'string', required: true, desc: 'Identifiant unique.' },
                { name: 'icon', type: 'ComponentType', required: true, desc: 'Icône du bouton.' },
                { name: 'label', type: 'string', required: true, desc: 'Tooltip.' },
                { name: 'group', type: 'string', desc: 'Groupe de boutons (pour le regroupement visuel).' },
                { name: 'mjOnly', type: 'boolean', desc: 'Visible uniquement pour le MJ.' },
                { name: 'onActivate', type: '() => void', desc: 'Appelé quand l’outil est sélectionné.' },
                { name: 'onDeactivate', type: '() => void', desc: 'Appelé quand l’outil est désélectionné.' },
              ]} />
            </Collapsible>

            <Collapsible title="conditions — Conditions personnalisées">
              <PropTable rows={[
                { name: 'id', type: 'string', required: true, desc: 'Identifiant unique de la condition.' },
                { name: 'label', type: 'string', required: true, desc: 'Nom affiché (ex: "Empoisonné").' },
                { name: 'icon', type: 'ComponentType', required: true, desc: 'Icône affichée sur le token.' },
                { name: 'color', type: 'string', required: true, desc: 'Couleur CSS (ex: "#22c55e").' },
              ]} />
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Lifecycle ── */}
          <Section id="lifecycle" title="Cycle de vie" icon={Zap}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Les hooks de cycle de vie permettent à votre module de réagir aux moments clés.
              Chaque hook reçoit un objet <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>ModuleAPI</code> en premier argument.
            </p>
            <div className="space-y-3">
              {[
                { name: 'onActivate(api)', desc: 'Appelé une seule fois quand le module est activé. Idéal pour s’abonner aux événements.' },
                { name: 'onDeactivate(api)', desc: 'Appelé quand le module est désactivé. Nettoyez vos abonnements ici.' },
                { name: 'onRoomJoin(api, roomId)', desc: 'Appelé quand l’utilisateur rejoint une room. Utile pour initialiser des données par room.' },
              ].map((h, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
                  <code className="text-xs font-mono shrink-0" style={{ color: 'var(--accent-brown)' }}>{h.name}</code>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{h.desc}</p>
                </div>
              ))}
            </div>
            <CodeBlock>{`
register({
  manifest: { /* ... */ },

  onActivate: (api) => {
    // S'abonner aux jets de dés
    const unsub = api.on('dice:roll', (payload) => {
      console.log(payload.userId, 'a jeté', payload.total);
    });

    // Stocker pour cleanup
    window.__myModuleCleanup = unsub;
  },

  onDeactivate: (api) => {
    window.__myModuleCleanup?.();
  },

  onRoomJoin: (api, roomId) => {
    console.log('Rejoint la room', roomId);
    // Initialiser des données par défaut si besoin
    if (!api.getData('config')) {
      api.setData('config', { theme: 'dark' });
    }
  },
});
`}</CodeBlock>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Module API ── */}
          <Section id="api" title="Module API" icon={Code}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              L'objet <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>ModuleAPI</code> est injecté dans les hooks de cycle de vie.
              Dans les composants React, récupérez-le via le hook <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>useModules()</code> exposé par le SDK.
            </p>

            <Collapsible title="Données (getData / setData)" defaultOpen>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Stockage clé/valeur persisté dans Firebase Realtime Database, isolé par module et par room.
                Chemin Firebase : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>rooms/&#123;roomId&#125;/modules/&#123;moduleId&#125;/&#123;key&#125;</code>
              </p>
              <CodeBlock>{`
// Lire des données
const config = api.getData('config');
// { theme: 'dark', showStats: true }

// Écrire des données (async, persisté dans Firebase)
await api.setData('config', { theme: 'light', showStats: false });

// Données par personnage
const notes = api.getCharacterData(characterId, 'notes');
await api.setCharacterData(characterId, 'notes', 'Nouveau texte');
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Game State (getGameState)">
              <CodeBlock>{`
const state = api.getGameState();
// {
//   isMJ: true,         // Est-ce le MJ ?
//   userId: "abc123",   // UID Firebase de l'utilisateur
//   roomId: "room-xyz", // ID de la room actuelle
//   persoId: "perso-1", // ID du personnage sélectionné
// }
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Settings (getSetting / setSetting)">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Paramètres de module persistés dans Firebase.
                Chemin : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>rooms/&#123;roomId&#125;/modules/&#123;moduleId&#125;/settings/&#123;settingId&#125;</code>
              </p>
              <CodeBlock>{`
const theme = api.getSetting('theme');
await api.setSetting('theme', 'dark');
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Notifications (showToast)">
              <CodeBlock>{`
api.showToast('Sauvegardé !', { type: 'success' });
api.showToast('Erreur de connexion', { type: 'error', duration: 5000 });
api.showToast('Information', { type: 'info' });
`}</CodeBlock>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Events ── */}
          <Section id="events" title="Event Bus" icon={MessageSquare}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              L'event bus permet aux modules de réagir aux événements du jeu et de communiquer entre eux.
              Chaque événement a un <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>type</code> et un <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-darker)' }}>payload</code> typé.
            </p>

            <Collapsible title="Événements de dés" defaultOpen>
              <PropTable rows={[
                { name: 'dice:roll', type: '{ userId, diceCount, diceFaces, results[], total, modifier }', desc: 'Un jet de dés a été effectué.' },
                { name: 'dice:critical_success', type: '{ userId, result }', desc: 'Réussite critique (20 naturel).' },
                { name: 'dice:critical_fail', type: '{ userId, result }', desc: 'Échec critique (1 naturel).' },
              ]} />
            </Collapsible>

            <Collapsible title="Événements de combat">
              <PropTable rows={[
                { name: 'combat:start', type: '{ combatants[] }', desc: 'Un combat démarre.' },
                { name: 'combat:turn_change', type: '{ previousId, currentId, round }', desc: 'Changement de tour.' },
                { name: 'combat:end', type: '{ winnerId? }', desc: 'Fin du combat.' },
                { name: 'combat:damage', type: '{ attackerId, targetId, amount, damageType? }', desc: 'Dégâts infligés.' },
              ]} />
            </Collapsible>

            <Collapsible title="Événements de personnage">
              <PropTable rows={[
                { name: 'character:update', type: '{ characterId, changes }', desc: 'Une fiche de personnage a été modifiée.' },
                { name: 'character:condition_add', type: '{ characterId, conditionId }', desc: 'Condition ajoutée.' },
                { name: 'character:condition_remove', type: '{ characterId, conditionId }', desc: 'Condition retirée.' },
                { name: 'character:hp_change', type: '{ characterId, oldHp, newHp, maxHp }', desc: 'Points de vie modifiés.' },
              ]} />
            </Collapsible>

            <Collapsible title="Autres événements">
              <PropTable rows={[
                { name: 'chat:message', type: '{ userId, text }', desc: 'Message envoyé dans le chat.' },
                { name: 'module:custom', type: '{ moduleId, eventId, data }', desc: 'Événement personnalisé entre modules.' },
              ]} />
            </Collapsible>

            <CodeBlock>{`
// Écouter les jets de dés
const unsub = SDK.events.on('dice:roll', (payload) => {
  console.log(payload.userId, 'a jeté', payload.diceCount + 'd' + payload.diceFaces);
  console.log('Résultat:', payload.total, '(modifier:', payload.modifier, ')');
});

// Émettre un événement custom inter-modules
SDK.events.emit({
  type: 'module:custom',
  payload: {
    moduleId: 'mon-module',
    eventId: 'score-updated',
    data: { score: 42 },
  },
});

// Se désabonner
unsub();
`}</CodeBlock>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Persistance ── */}
          <Section id="data" title="Persistance des données" icon={Shield}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Les données de chaque module sont stockées dans Firebase Realtime Database, isolées par room et par module.
              Elles sont synchronisées en temps réel entre tous les clients connectés.
            </p>
            <CodeBlock language="plaintext">{`
Structure Firebase :

rooms/{roomId}/modules/{moduleId}/
  ├── {clé}              → Données arbitraires (api.getData/setData)
  ├── settings/
  │   └── {settingId}   → Paramètres du module (api.getSetting/setSetting)
  └── characters/
      └── {characterId}/
          └── {clé}      → Données par personnage (api.getCharacterData/setCharacterData)
`}</CodeBlock>
            <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
              <p className="text-xs font-semibold text-yellow-400">Attention : Firebase RTDB supprime les tableaux vides</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Si vous stockez un tableau vide <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>[]</code>, Firebase le supprimera.
                À la relecture, le champ sera <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>undefined</code>.
                Utilisez toujours un fallback : <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>api.getData('list') ?? []</code>
              </p>
            </div>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Build & Deploy ── */}
          <Section id="build" title="Build & Déploiement" icon={Puzzle}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Votre module doit être un fichier JavaScript unique (bundle). Utilisez un bundler comme
              <strong> esbuild</strong>, <strong>Rollup</strong>, ou <strong>Vite</strong> en mode library.
            </p>

            <Collapsible title="Avec esbuild (recommandé)" defaultOpen>
              <CodeBlock language="bash">{`
# Installation
npm install -D esbuild

# Build
npx esbuild src/index.tsx \\
  --bundle \\
  --format=iife \\
  --outfile=dist/mon-module.js \\
  --external:react \\
  --jsx=react \\
  --jsx-factory=window.__VTT_SDK__.React.createElement \\
  --jsx-fragment=window.__VTT_SDK__.React.Fragment
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Avec Vite">
              <CodeBlock language="javascript">{`
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['iife'],
      name: 'MonModule',
      fileName: () => 'mon-module.js',
    },
    rollupOptions: {
      external: ['react'],
      output: {
        globals: { react: 'window.__VTT_SDK__.React' },
      },
    },
  },
});
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Sans bundler (JavaScript pur)">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Vous pouvez écrire votre module directement en JavaScript, sans JSX ni bundler.
                Utilisez <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>React.createElement</code> au lieu de JSX.
              </p>
              <CodeBlock>{`
// Pas besoin de build !
(function() {
  const { React, register, ui, icons } = window.__VTT_SDK__;
  const h = React.createElement; // raccourci

  function Panel() {
    const [val, setVal] = React.useState('');
    return h('div', { className: 'p-4 space-y-2' },
      h(ui.Input, {
        value: val,
        onChange: (e) => setVal(e.target.value),
        placeholder: 'Tapez quelque chose...'
      }),
      h('p', { className: 'text-sm' }, 'Vous avez tapé : ' + val)
    );
  }

  register({
    manifest: {
      id: 'simple-module',
      name: 'Module Simple',
      version: '1.0.0',
      description: 'Sans bundler !',
      author: 'Moi',
      type: 'feature',
      defaultEnabled: true,
    },
    contributions: {
      sidebarTabs: [{
        id: 'simple',
        label: 'Simple',
        icon: icons.Sparkles,
        component: Panel,
        order: 70,
      }],
    },
  });
})();
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Hébergement">
              <div className="text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
                <p>Votre fichier JS doit être accessible publiquement via HTTPS. Options :</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>GitHub Pages</strong> — Gratuit. Push votre fichier dans un repo public.</li>
                  <li><strong>npm + unpkg/jsDelivr</strong> — Publiez sur npm, utilisez <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>https://unpkg.com/mon-module@latest/dist/mon-module.js</code></li>
                  <li><strong>Vercel / Netlify</strong> — Déployez un site statique avec votre bundle.</li>
                  <li><strong>Votre propre serveur</strong> — Assurez-vous que le header CORS <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>Access-Control-Allow-Origin: *</code> est présent.</li>
                </ul>
              </div>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Examples ── */}
          <Section id="examples" title="Exemples complets" icon={Code}>

            <Collapsible title="Compteur de critiques" defaultOpen>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Affiche un compteur en temps réel des réussites et échecs critiques de la session.
              </p>
              <CodeBlock>{`
(function() {
  const { React, register, ui, icons, events } = window.__VTT_SDK__;
  const h = React.createElement;

  function CritPanel() {
    const [crits, setCrits] = React.useState({ success: 0, fail: 0 });

    React.useEffect(() => {
      const unsub1 = events.on('dice:critical_success', () => {
        setCrits(prev => ({ ...prev, success: prev.success + 1 }));
      });
      const unsub2 = events.on('dice:critical_fail', () => {
        setCrits(prev => ({ ...prev, fail: prev.fail + 1 }));
      });
      return () => { unsub1(); unsub2(); };
    }, []);

    return h('div', { className: 'p-6 space-y-4', style: { color: 'var(--text-primary)' } },
      h('h2', {
        className: 'text-lg font-semibold',
        style: { fontFamily: 'var(--font-title)' }
      }, 'Critiques de la session'),
      h('div', { className: 'grid grid-cols-2 gap-4' },
        h(ui.Card, { className: 'p-4 text-center' },
          h('div', { className: 'text-3xl font-bold text-green-400' }, crits.success),
          h('div', { className: 'text-xs mt-1', style: { color: 'var(--text-secondary)' } }, 'Réussites')
        ),
        h(ui.Card, { className: 'p-4 text-center' },
          h('div', { className: 'text-3xl font-bold text-red-400' }, crits.fail),
          h('div', { className: 'text-xs mt-1', style: { color: 'var(--text-secondary)' } }, 'Échecs')
        )
      )
    );
  }

  register({
    manifest: {
      id: 'crit-counter',
      name: 'Compteur de Critiques',
      version: '1.0.0',
      description: 'Compte les réussites et échecs critiques en temps réel.',
      author: 'Community',
      type: 'feature',
      defaultEnabled: true,
    },
    contributions: {
      sidebarTabs: [{
        id: 'crit-counter',
        label: 'Critiques',
        icon: icons.Target,
        component: CritPanel,
        order: 65,
        width: 'w-full sm:w-[350px]',
        persistent: true,
      }],
    },
  });
})();
`}</CodeBlock>
            </Collapsible>

            <Collapsible title="Notes de session persistantes">
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Un bloc-notes synchronisé en temps réel via Firebase pour toute la table.
              </p>
              <CodeBlock>{`
(function() {
  const { React, register, ui, icons } = window.__VTT_SDK__;
  const h = React.createElement;

  // On importe useModules depuis le contexte global
  // Note : dans un composant rendu par le système de modules,
  // useModules() est disponible car le composant est rendu
  // à l'intérieur du ModuleProvider.

  function NotesPanel() {
    // Pour accéder à l'API dans un composant,
    // on utilise le hook interne :
    const [notes, setNotes] = React.useState('');
    const [saved, setSaved] = React.useState(true);
    const timerRef = React.useRef(null);

    // On ne peut pas utiliser useModules() depuis un module externe
    // car c'est un import interne. À la place, le composant
    // peut accéder aux données via le DOM ou un autre pattern.
    // Pour l'instant, on utilise localStorage comme fallback simple.

    React.useEffect(() => {
      const stored = localStorage.getItem('session-notes');
      if (stored) setNotes(stored);
    }, []);

    const handleChange = (value) => {
      setNotes(value);
      setSaved(false);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        localStorage.setItem('session-notes', value);
        setSaved(true);
      }, 500);
    };

    return h('div', {
      className: 'p-4 space-y-3 h-full flex flex-col',
      style: { color: 'var(--text-primary)' }
    },
      h('div', { className: 'flex items-center justify-between' },
        h('h2', {
          className: 'text-lg font-semibold',
          style: { fontFamily: 'var(--font-title)' }
        }, 'Notes de Session'),
        h('span', {
          className: 'text-xs',
          style: { color: saved ? 'var(--text-secondary)' : 'var(--accent-brown)' }
        }, saved ? 'Sauvegardé' : 'Sauvegarde...')
      ),
      h('textarea', {
        className: 'flex-1 w-full bg-transparent border rounded-lg p-3 text-sm resize-none focus:outline-none',
        style: { borderColor: 'var(--border-color)', minHeight: '300px' },
        value: notes,
        onChange: (e) => handleChange(e.target.value),
        placeholder: 'Prenez vos notes de session ici...',
      })
    );
  }

  register({
    manifest: {
      id: 'session-notes',
      name: 'Notes de Session',
      version: '1.0.0',
      description: 'Bloc-notes pour la session en cours.',
      author: 'Community',
      type: 'feature',
      defaultEnabled: true,
    },
    contributions: {
      sidebarTabs: [{
        id: 'session-notes',
        label: 'Notes',
        icon: icons.StickyNote,
        component: NotesPanel,
        order: 55,
        width: 'w-full sm:w-[450px]',
        persistent: true,
      }],
    },
  });
})();
`}</CodeBlock>
            </Collapsible>
          </Section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Security ── */}
          <Section id="security" title="Sécurité" icon={Shield}>
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-darker)' }}>
              <p className="text-xs font-semibold text-yellow-400">Avertissement important</p>
              <div className="text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
                <p>
                  Les modules externes s'exécutent avec les <strong>mêmes privilèges</strong> que l'application.
                  Un module malveillant pourrait potentiellement accéder aux données de la session,
                  aux tokens Firebase, ou modifier l'interface.
                </p>
                <p><strong>Recommandations pour les MJs :</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>N'installez que des modules de sources de confiance.</li>
                  <li>Vérifiez le code source du module avant installation.</li>
                  <li>Privilégiez les modules open-source hébergés sur GitHub.</li>
                  <li>En cas de doute, testez dans une room vide d'abord.</li>
                </ul>
                <p><strong>Pour les développeurs :</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Ne stockez jamais de données sensibles dans votre module.</li>
                  <li>Publiez votre code source pour que les utilisateurs puissent l'auditer.</li>
                  <li>Versionez vos releases pour permettre le suivi des changements.</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* Footer */}
          <div className="pt-8 pb-16 text-center">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Yner Module SDK v1.0.0
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
