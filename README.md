# VTT-DD — Virtual Tabletop for Tabletop RPGs

<div align="center">

[![Accéder au site](https://img.shields.io/badge/Acc%C3%A9der%20au%20site-yner.fr-DAA520?style=for-the-badge)](https://www.yner.fr)

</div>

A full-featured, real-time Virtual Tabletop platform. Originally built for Dungeons & Dragons, now designed around a multi-system architecture — D&D ships as a built-in module, and other rule systems (dice-pool, symbol-dice) can be added the same way. For Game Masters and players who want a modern, immersive, and highly customizable online tabletop experience.

> Built with Next.js 16, React 19, TypeScript, Firebase, and Three.js.

---

## Overview

VTT-DD provides everything needed to run a complete campaign online — from interactive maps with fog of war to synchronized audio, character sheets, dice rolling, and turn-based combat — all in real time across all connected players.

---

## Features

### Interactive Map
- Zoomable, pannable map canvas with a toggleable grid
- Drag & drop token placement for players and NPCs
- Fog of war system with customizable visibility radius per character
- Line-of-sight blocking via obstacles (walls, closed rooms, doors, windows)
- Light zones that illuminate surrounding fog
- Dynamic weather overlay (rain, snow, fog, sandstorm)
- Free drawing and text annotations
- Multiple scenes per campaign — GM navigates freely, players are assigned to scenes
- Layer system: toggle visibility of objects, obstacles, fog, text, drawings, NPCs, etc.
- Portal system to link scenes or teleport within a scene
- Spawn point definition per scene
- Player cursor tracking
- Live screen/webcam sharing to the table (WebRTC)

### Characters & Character Sheets
- Full character sheets: stats, skills, and combat values driven by the active game system
- Customizable layout: freely resize and reposition blocks, choose colors, fonts, borders
- Custom fields: define new fields as modifiers or plain values, mark as dice-eligible
- Level-up system
- Stat comparison view across all party members
- Token customization: cropping, borders, decorations
- Avatar library by race/species + custom upload
- Character sheets visible to all party members (read-only for others)

### Inventory
- Add, rename, remove items and manage quantities
- Define item bonuses (e.g. Armor +3 DEF)
- Toggle bonuses on/off contextually

### Skills & Abilities
- Skill trees / talent trees with unlock paths
- Activate/deactivate skills and their associated bonuses
- Manually edit skill bonuses and paths
- Add custom paths and modify skills within a path

### Dice System
- Standard dice (d4, d6, d8, d10, d12, d20, d100), custom dice, and symbol-based dice pools (for narrative systems)
- Complex formula support via `@dice-roller/rpg-dice-roller`
- 3D physics-based dice with toggleable animation
- Roll visibility: public, private (player + GM), or hidden (GM only)
- Per-player roll history with filtering and statistics
- Dice skin shop (cosmetic, unlockable)

### Combat
- Turn-by-turn initiative tracker
- Attack types: Melee, Ranged, Magic — select weapon from inventory
- Apply, modify, or reject incoming damage before confirming
- Status effects (Fatigue, Blind, etc.)
- Area attacks: zones, cones, lines with auto-targeting
- Encounter generator (balanced enemy groups from a budget)
- Full action history log

### Audio
- Synchronized music player (YouTube + library + custom uploads) — controlled by GM, synced to all players in real time (<1s latency)
- Spatial audio zones: volume fades as players move away from the source
- Instant sound effects playable to all players simultaneously
- Audio mixer for music, zone audio, and sound effects
- Personal volume control per player

### Chat & Notes
- Room chat with support for targeted messages (single player, all players)
- Image sharing in chat
- Rich-text scenario editor (Tiptap) with @mentions for characters and scenes
- Per-player notes with sharing, editing, deletion, and image support

### NPC & Bestiary
- Add NPCs from a bestiary or configure by race and profile
- Per-instance customization: stats, image, visibility (visible / hidden / invisible)
- Hidden NPCs appear only if within a player's line of sight and not in shadow
- Invisible NPCs never appear to players
- Ally NPCs contribute their own visibility radius to clear fog
- Drag & drop from model library to map — instances are independent from templates
- Place multiple instances at once
- Restrict visibility to specific players only
- AI-assisted creature generation

### Objects & Props
- Object library with 1000+ assets + custom creation
- Resize and rotate objects freely
- Set as interactive (searchable) or embedded in the scene (decorative)
- Show/hide per player

### Sessions & Rooms
- Create rooms with a defined player count, public or private
- Share a room code with players to join
- GM controls whether players can create custom characters or use GM-prepared ones
- Full room settings management (player list, permissions, scale, display preferences)
- Play directly inside Discord via the embedded Discord Activity

### Profile & Social
- Customize avatar, banner, border decoration, and title
- Friend system with friend requests
- Subscription management via Stripe
- Email preferences and password management

### Settings & Accessibility
- Custom keyboard shortcuts for menus and dice rolls
- Token scale adjustment
- Character border display toggle
- Cursor sharing toggle (show/hide own cursor, show/hide other cursors)
- Custom cursor colors
- Theme customization
- Challenge system to unlock cosmetic rewards (dice, tokens, titles)

### Resources & Library
- Image library (up to 5 GB per account)
- Bestiary, item price list, full ability/skill database
- AI-assisted scenario writing and session history summarization

---

## Architecture: Multi-System Engine

VTT-DD is not hard-coded to a single ruleset. Game systems are modules, and D&D 5e ships as the default **built-in** one — the same mechanism third-party modules use (see [Module SDK](#module-sdk) below), just trusted and bundled with the app.

```
src/modules/
├── sdk.ts                    # window.__VTT_SDK__ — the public plugin API
├── registry.ts                # Module registration/lookup
├── event-bus.ts               # Cross-module pub/sub (dice rolls, combat turns, chat…)
├── builtin/
│   ├── dnd-classic/           # D&D 5e ruleset, shipped as a built-in module
│   └── module-manager/        # In-app UI to install/enable/disable modules
├── game-system/                # Game-system abstraction layer (stats, resolvers, formulas)
├── game-content/               # Content packs (bestiaries, items, abilities) decoupled from rules
├── bundle-scripts/             # Runtime loader/linker for a bundle's scripts/*.tsx (full page privileges, no sandbox)
└── export-bundle/              # Packaging/export of a module into a distributable bundle (.zip)
```

The rules engine itself (`src/lib/rules-engine/`) is system-agnostic: it resolves formulas, dice pools, characteristics, skills, specializations, and talent trees against whichever active module defines them — so adding a new game system means writing a new module, not forking the app.

Manage installed modules from the in-app panel at `/modules/manager`.

---

## Module SDK

For **developers who want to extend the VTT without touching the core codebase**: write a module, host the `.js` file anywhere, and register it through the in-app module manager (`/modules`, full docs at `/modules` itself — the page you're reading now is a summary). Modules can add sidebar panels, character sheet widgets, context-menu items, toolbar buttons, custom conditions, listen to game events (dice rolls, combat, chat), and reuse the app's own UI components.

The SDK is exposed at `window.__VTT_SDK__` once the app has loaded. Full interactive docs — with copyable code for every contribution type, the full event catalogue, and build/hosting recipes — live at **`/modules`** in the running app.

### Writing a Module

```js
// my-module.js
(function () {
  const SDK = window.__VTT_SDK__;
  const { React, register, ui, icons } = SDK;
  const { useState } = React;
  const { Button, Card } = ui;

  function MyPanel() {
    const [count, setCount] = useState(0);
    return React.createElement(Card, { className: 'p-4' },
      React.createElement(Button, { onClick: () => setCount(c => c + 1) }, 'Count: ' + count)
    );
  }

  register({
    manifest: {
      id: 'my-module',
      name: 'My Module',
      version: '1.0.0',
      description: 'A short description.',
      author: 'Your Name',
      type: 'feature',           // 'feature' | 'game-system' | 'content'
      defaultEnabled: true,
    },
    contributions: {
      sidebarTabs: [{
        id: 'my-panel',
        label: 'My Module',
        icon: icons.Star,
        component: MyPanel,
        order: 60,
        width: 'w-full sm:w-[400px]',
        persistent: true,
      }],
    },
  });
})();
```

### What the SDK exposes

| Namespace | Contents |
|---|---|
| `sdk.React` | The app's React instance — don't bundle your own |
| `sdk.register(definition)` | Registers your module into the app |
| `sdk.events.on / .emit` | Cross-module event bus — `dice:roll`, `dice:critical_success/fail`, `combat:start/turn_change/end/damage`, `character:update/condition_add/condition_remove/hp_change`, `chat:message`, `module:custom` |
| `sdk.ui.*` | shadcn/ui primitives: `Button`, `Card`, `Dialog`, `Tabs`, `Select`, `Tooltip`, `Switch`, `ScrollArea`, `Badge`, `Input`, `Label`, `Separator`, plus `RotatingEarth` (procedural 3D globe) |
| `sdk.icons` | The full Lucide icon set |
| `sdk.version` | SDK version string |

### Contribution points

A module's `contributions` object declares what it adds to the UI. All of them are optional and combinable:

| Contribution | Adds |
|---|---|
| `sidebarTabs` | A button in the left sidebar that opens a custom panel |
| `characterWidgets` | A draggable/resizable widget on the character sheet grid (receives `characterId`, `roomId`) |
| `contextMenuItems` | Entries in the right-click menu on the map, a character, or an object |
| `toolbarItems` | Buttons in the map toolbar, optionally grouped |
| `conditions` | Custom status-effect icons/colors selectable on tokens |

### Lifecycle hooks & Module API

`onActivate(api)`, `onDeactivate(api)`, and `onRoomJoin(api, roomId)` let a module react to key moments. The injected `ModuleAPI` gives access to:

- `api.getData(key)` / `setData(key, value)` — per-room, per-module key/value storage (Realtime Database)
- `api.getCharacterData(characterId, key)` / `setCharacterData(...)` — per-character storage
- `api.getGameState()` — `{ isMJ, userId, roomId, persoId }`
- `api.getSetting(id)` / `setSetting(id, value)` — module settings
- `api.showToast(message, { type, duration })`

### Module Manifest Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique identifier across the platform |
| `name` | `string` | yes | Display name |
| `version` | `string` | yes | Semver string |
| `description` | `string` | yes | Short description |
| `author` | `string` | yes | Author or studio name |
| `type` | `"feature" \| "game-system" \| "content"` | yes | Module category — see [Game System Modules](#game-system-modules) for `"game-system"` |
| `dependencies` | `string[]` | — | IDs of modules to load before this one |
| `defaultEnabled` | `boolean` | — | Auto-enable after install |
| `requiresMJ` | `boolean` | — | Restrict activation to the GM |

### Security

External modules run with the **same privileges as the app itself** — there is no sandbox. A malicious module could read session data, Firebase tokens, or alter the UI. Only install modules from sources you trust, prefer open-source ones you can audit, and test in an empty room first.

---

## Game System Modules

A **game system** is a special module (`manifest.type: 'game-system'`) that replaces the ruleset a table plays with — stats, dice, character creation, skills, combat resolution — instead of just adding a UI panel. D&D 5e ships as the app's default, built-in game system; it uses the exact same contract every other game system does.

### The contract: `GameSystemDefinition`

Everything a game system can define lives in one interface (`src/modules/game-system/types.ts`), entirely data-driven — no game-specific logic is hard-coded in the rules engine:

| Field | Purpose |
|---|---|
| `stats` | The full stat schema: `ability` (rolled/bought, e.g. STR), `derived` (computed via formula, e.g. AC), `vital` (a bounded gauge, e.g. HP), `meta` (informational, no formula) |
| `modifierFormula` | Global modifier formula shared by every ability stat (e.g. `floor((self-10)/2)`) |
| `creation` | Character creation method (`roll` \| `point-buy` \| `manual`), roll formula, and constraints (e.g. "reroll unless the sum of modifiers is ≥ 2") |
| `races` / `profiles` | Species and career/class options offered at creation, with stat modifiers and abilities |
| `skills` | Named skills linked to an ability stat (e.g. Athletics → Strength) |
| `symbolDice` | Narrative dice with arbitrary symbols per face (see below) — absent means a purely numeric system |
| `diceUpgradeRule` | Generic dice-pool composition: `max(a,b)` base dice, `min(a,b)` upgraded to a better die |
| `combat` / `initiative` | Attack resolution and initiative rules for either numeric or symbol-dice systems |
| `groupEntityLabel` / `groupEntityStats` | An entity owned by the whole table rather than one character (e.g. a starship, a stronghold) |
| `rules`, `locationLabel`/`locationFields`, `maps`, `obligation`, `typography`, `objectLibraryId` | Glossary entries, a "Places" tab, in-app maps, narrative debt mechanics, custom fonts/theme, and an alternate draggable-object library |

All formulas (`FormulaNode`) are a JSON-serializable AST (`const`, `stat`, `modifier`, `dice`, `add`/`sub`/`floor`/`clamp`, …) — never a string `eval`'d at runtime, so a system's rules can be stored in Firestore and edited from the in-app rules editor.

### Symbol dice (narrative systems)

`symbolDice` lets a game system define dice with arbitrary named symbols per face instead of numbers — the engine has no built-in notion of "Success" or "Advantage"; those are just ordinary stats the GM defines and assigns values to on each die face:

```ts
{ key: 'ability', label: 'Ability', faces: [
  { values: {} },                    // blank face
  { values: { succesBrut: 1 } },
  { values: { succesBrut: 1, avantageBrut: 1 } },
  // ...
] }
```

Rolling a pool sums the raw values across all rolled faces, then feeds them into the same formula-resolution engine used for characters — a `derived` stat like `succesNets = max(sub(succesBrut, echecBrut), 0)` is computed identically whether it comes from a die roll or a character sheet.

### Two ways to ship a game system

| | **Built-in** (e.g. D&D 5e) | **Bundle** (e.g. a Star Wars/Genesys-style system) |
|---|---|---|
| Where it lives | `src/modules/builtin/dnd-classic/` — compiled TypeScript, part of the app build | A `.zip` imported at runtime — `table.json` (rules, pure JSON) + `assets/` + `styles/` + `scripts/main.tsx` |
| How rules are defined | `stats.ts` builds `StatDefinition[]` and formulas in code; `creation.ts` exports a `CharacterCreationRule` | The same `GameSystemDefinition` shape, but authored as data in `table.json` — editable from the in-app rules editor, no build step |
| Custom UI (widgets, mini-games, map overlays) | Regular app components | `scripts/*.tsx`, interpreted at import time (via `sucrase`, no bundler needed) and registered through `ctx.register({ sidebarTabs, characterWidgets, creationTabs, searchDrawerTabs, interactionGames })` |
| Trust model | Trusted (ships with the app) | Full page privileges, same as an external SDK module — a warning is shown on import |

Both forms implement the exact same `GameSystemDefinition` — a bundle is simply a way to author and distribute one without touching the codebase or running a build.

### Building a bundle

A full worked example — a Star Wars/Genesys-style system with symbol dice, starships as a group entity, an Obligation mechanic, custom fonts, and a dozen `scripts/*.tsx` UI extensions (sensors overlay, sabacc minigame, ship deployment, audio mixer replacement) — lives in [`starwars-bundle/`](./starwars-bundle). Its own [README](./starwars-bundle/README.md) documents the bundle file format in full: asset path rewriting, the `typography` block, injectable `styles/*.css`, and the `scripts/main.tsx` entry point's `ctx.register(...)` / `ctx.api` / `ctx.ui` surface (dice engine, character data, room state, map view flags, shared measurements, toasts).

```bash
npm run bundle:zip -- starwars-bundle    # scripts/zip-bundle.mjs → starwars-bundle.zip
```

Import the resulting `.zip` from the Export/Import panel, the `/creer` page, or the in-app rules editor. Re-importing the same bundle overwrites the same uploaded assets (no duplicates); renaming `gameSystem.name` changes the asset storage prefix and orphans the old files.

---

## Testing

VTT-DD has three test layers: **unit tests** (pure logic), **E2E tests** (real Firestore via the Firebase Emulator), and **Playwright** (browser end-to-end).

### Unit Tests

Pure function tests with Jest + jsdom. No network, no Firebase — fast and isolated.

```bash
npm test                # run all unit tests
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

| Suite | What is tested |
|---|---|
| `src/__tests__/character-variables.test.ts` | `applyVariables` — stat variable substitution |
| `src/__tests__/character-variables.build.test.ts` | Build-time variable resolution |
| `src/__tests__/encounter-utils.test.ts` | `getEncounterMultiplier`, `calculateEncounterBudget` |
| `src/__tests__/imageUtils.test.ts` | `getContrastColor` (YIQ formula) |
| `src/__tests__/titles.test.ts` | `generateSlug`, `INITIAL_TITLES` |
| `src/__tests__/inventaire.logic.test.ts` | `filterAndSort`, `canGiveItem`, predefined items |
| `src/__tests__/fiche.logic.test.ts` | `sanitizeLayout`, `updateWidgetDim`, `parseWidgetId` |
| `src/__tests__/competences.logic.test.ts` | Point calculation, unlock logic, dice parsing |
| `src/__tests__/glowing-ai.logic.test.ts` | Roll parsing, stat building, display rules |
| `src/__tests__/mjcombat.logic.test.ts` | Initiative sort, damage calc, condition handling |
| `src/lib/rules-engine/__tests__/*.test.ts` | System-agnostic rules engine: characteristics, creation, dice-pool, formula-parser, formula, resolver, skills, specializations, symbol-dice, talent-tree |
| `src/modules/__tests__/registry-sidebar-actions.test.ts` | Module registry sidebar action wiring |
| `src/modules/builtin/dnd-classic/__tests__/dnd-classic.test.ts` | D&D 5e built-in module |
| `src/modules/bundle-scripts/__tests__/linker.test.ts` | Bundle script loader/linker (`scripts/main.tsx` execution) |
| `src/modules/export-bundle/__tests__/{transfer,zip}.test.ts` | Module packaging/export |
| `src/modules/game-content/__tests__/legacy.test.ts` | Legacy content-pack migration |
| `src/modules/game-system/__tests__/transfer.test.ts` | Game-system data transfer |

### E2E Tests (Firebase Emulator)

Integration tests that run real Firestore operations against the local Firebase Emulator. Requires Java and the Firebase CLI.

**Prerequisites:**

```bash
# Install Firebase CLI (once)
npm install -g firebase-tools

# Java is required for the Firestore emulator (JDK 11+)
# macOS: brew install --cask temurin
```

**Run:**

```bash
npm run test:e2e
```

This command starts the Firestore emulator, runs the full E2E suite, then stops the emulator automatically.

| Suite | Collections tested |
|---|---|
| `characters.e2e.test.ts` | `cartes/{roomId}/characters`, `Inventaire`, `Bonus` |
| `fiche.e2e.test.ts` | Characters stats, layout, theme, customFields, level-up, avatar |
| `inventaire2.e2e.test.ts` | `Inventaire/{roomId}/{player}`, `Bonus/{roomId}/{player}/{itemId}` |
| `combat.e2e.test.ts` | Characters (initiative batch), combat rapport, `global_sounds`, `Inventaire` (weapon sounds) |
| `competences.e2e.test.ts` | `characters` (voies), `customCompetences`, `Bonus` |
| `rolls.e2e.test.ts` | `rolls/{roomId}/rolls`, `users` (titles nat1/nat20) |
| `historique.e2e.test.ts` | `Historique/{roomId}/events`, `Notes`, `SharedNotes` |
| `map.e2e.test.ts` | `cities`, `characters` (tokens), `objects`, `lights`, `measurements`, `musicZones`, `settings`, `fog`, `fond` |
| `security.e2e.test.ts` | Firestore security rules (access control) |

### Playwright (browser E2E)

```bash
npm run test:playwright         # headless
npm run test:playwright:ui      # interactive UI mode
npm run test:playwright:headed  # headed browser
```

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| UI | shadcn/ui, Radix UI, `@base-ui-components/react`, Framer Motion, Motion, GSAP |
| 3D & Shaders | Three.js, `@react-three/fiber`, `@react-three/drei`, `@react-three/cannon`, `@react-three/postprocessing`, `@paper-design/shaders-react`, `lamina` |
| Rich content | Tiptap (scenario/notes editor), `@xyflow/react` (flow graphs), `chess.js` / `react-chessboard` |
| Drag & drop | `@dnd-kit/*`, `react-grid-layout` |
| Backend | Firebase Auth, Firestore, Realtime Database, Firebase Storage, `firebase-admin` |
| Payments | Stripe (`stripe`, `@stripe/stripe-js`) |
| Real-time audio/video | LiveKit (`livekit-client`, `livekit-server-sdk`), WebRTC |
| Discord | `@discord/embedded-app-sdk`, `discord-interactions` |
| Storage | `@aws-sdk/client-s3`, `@vercel/blob`, `sharp` (image processing) |
| AI | `@google/generative-ai` (creature/scenario generation, session summaries) |
| Localization | `deepl-node` |
| Dice | `@dice-roller/rpg-dice-roller` |
| Email | Resend, React Email |
| Observability | OpenTelemetry, `@vercel/otel`, Vercel Analytics |
| Testing | Jest (unit + Firebase Emulator E2E), Playwright (browser E2E) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Firebase project with Authentication, Firestore, Realtime Database, and Storage enabled
- Stripe account (for subscription features)

### Installation

```bash
git clone https://github.com/theo-mrn/VTT-DD.git
cd VTT-DD
npm install
```

### Firebase Configuration

Configure your Firebase credentials in `src/lib/firebase.js`:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..."
};
```

### Firebase Security Rules

**Firestore:**
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /cartes/{roomId}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Realtime Database:**
```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        "music": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

### Run

```bash
npm run dev            # http://localhost:3000
npm run dev:discord    # HTTPS dev server, required to test the Discord Activity locally
```

---

## Project Structure

```
VTT-DD/
├── public/
│   ├── Assets/          # Pre-generated avatars by race
│   ├── Cartes/          # Map backgrounds (Forest, Village, etc.)
│   ├── Musics/          # Local ambient music
│   ├── Photos/          # Character image bank
│   ├── Token/           # Map tokens
│   └── tabs/            # Skill/rules data (JSON)
└── src/
    ├── app/
    │   ├── [roomid]/    # Game room pages (map, scenario, stream-view)
    │   ├── api/         # REST API routes (see below)
    │   ├── auth/
    │   ├── checkout/    # Stripe checkout flow (success/cancel pages)
    │   ├── creation/    # Character creation
    │   ├── discord/     # Discord Activity entry point
    │   ├── home/
    │   ├── mes-campagnes/
    │   ├── modules/     # Module manager UI + game-system browser
    │   ├── personnages/
    │   ├── profile/
    │   └── ressources/  # Bestiary, abilities, image library, marketplace
    ├── components/      # ~25 feature-scoped groups: (map), (combat), (dices),
    │                     # (chat), (music), (fiches), (inventaire), ui/, blocks/, …
    ├── contexts/
    │   ├── GameContext.tsx
    │   └── CompetencesContext.tsx
    ├── lib/
    │   ├── firebase.js
    │   ├── rules-engine/    # System-agnostic rules engine (formulas, dice pools, talents)
    │   └── utils.ts
    └── modules/          # Multi-system module architecture (see above)
```

---

## API

VTT-DD exposes a REST API. A subset is designed for external/programmatic use (CLI, bots, scripts); the rest powers the app's own client and is documented here for completeness.

### Authentication — CLI Login

Authenticate with your account credentials to generate an API key in one step:

```bash
curl -s -X POST https://www.yner.fr/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"*****"}'
```

The response prints the generated key and the exact commands to export it:

```
  Clé "cli" générée avec succès [8e932c790348bf32]

────────────────────────────────────────────────────────────
  1. Exporte la clé dans ta session :

     export VTT_API_KEY=vtt_...

  2. Pour la conserver entre les sessions :

     echo 'export VTT_API_KEY=vtt_...' >> ~/.zshrc
────────────────────────────────────────────────────────────
```

Once exported, all API calls use the key via the `Authorization: ApiKey` header.

### Managing API Keys

```bash
# List your keys
curl https://www.yner.fr/api/api-keys \
  -H "Authorization: ApiKey $VTT_API_KEY"

# Revoke a key
curl -X DELETE https://www.yner.fr/api/api-keys \
  -H "Authorization: ApiKey $VTT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyId": "KEY_ID"}'
```

Keys are prefixed `vtt_` and stored as SHA-256 hashes — the raw key is shown only once at creation.

### Dice Roll Endpoint

Roll dice remotely and optionally save the result to a room's roll history.

```
POST /api/roll-dice
```

```json
{
  "notation": "2d6+FOR",
  "roomId": "my-room-id",
  "persoId": "character-id",
  "isPrivate": false,
  "isBlind": false,
  "variables": { "FOR": 3, "DEX": -1 }
}
```

- `notation` — standard dice notation (`1d20`, `2d6+3`, `4d6kh3`)
- `variables` — override character stat modifiers, or omit to auto-fetch from the authenticated character
- `roomId` — if provided, the roll is saved to the room's history (requires authentication)
- `isBlind` — result visible to GM only

**Response:**
```json
{
  "total": 14,
  "rolls": [{ "type": "d6", "value": 5 }, { "type": "d6", "value": 6 }],
  "output": "2d6+FOR = [5, 6]+3 = 14",
  "timestamp": 1700000000000,
  "saved": true,
  "user": "Théo"
}
```

**Anonymous rolls** (no auth) are computed but not saved to any room.

### Billing (Stripe)

Powers the in-app subscription flow — not intended for direct external use, documented here for reference.

| Route | Method | Purpose |
|---|---|---|
| `/api/checkout` | `POST` | Create a Stripe Checkout session |
| `/api/stripe-webhook` | `POST` | Stripe webhook receiver (subscription lifecycle events) |
| `/api/stripe-portal` | — | Stripe customer billing portal link |
| `/api/subscribe` | `POST` | Subscribe to a plan |
| `/api/unsubscribe` | `POST` | Cancel a subscription |
| `/api/invoices` | `POST` | Fetch invoice history |

### Discord Activity

VTT-DD runs as a **Discord Activity** — an app embedded directly inside a Discord voice channel (via `@discord/embedded-app-sdk`), not a traditional bot process. There is no gateway connection or always-on bot; authentication and room creation happen through short-lived HTTP exchanges triggered from inside Discord.

| Route | Method | Purpose |
|---|---|---|
| `/api/discord/auth` | `POST` | OAuth code exchange for the embedded Activity |
| `/api/discord/token` | `POST` | Discord access/refresh token handling |
| `/api/discord/login` | `POST` | Link a Discord identity to a VTT account |
| `/api/discord/me` | `GET` | Current linked Discord user |
| `/api/discord/rooms` | `GET`, `POST` | List / create rooms from within Discord |
| `/api/discord/create-room` | `POST` | Create a room bound to the current Discord channel |
| `/api/discord/interactions` | `POST` | Discord Interactions webhook (slash commands) |

Run `npm run dev:discord` (HTTPS dev server) to test the Activity locally — Discord requires HTTPS even in development.

### Assets & Uploads

| Route | Method | Purpose |
|---|---|---|
| `/api/assets` | — | List/query the shared asset library |
| `/api/maps` | — | List/query available map backgrounds |
| `/api/upload-asset` | `POST` | Upload a custom image/asset |
| `/api/upload-sound` | `POST` | Upload a custom sound/music file |
| `/api/delete-asset` | `POST` | Delete an uploaded asset |
| `/api/proxy-image` | — | Proxy external images (CORS/caching) |
| `/api/file-size` | — | Probe a remote file's size before download |
| `/api/effects` | — | Visual effect definitions for the map |
| `/api/cron/optimize-images` | — | Scheduled image optimization (Vercel Cron) |

### AI-Assisted Content

| Route | Method | Purpose |
|---|---|---|
| `/api/generate-creature` | `POST` | Generate a creature/NPC via Google Generative AI |
| `/api/scenario-assist` | `POST` | AI writing assistance for the scenario editor |
| `/api/summarize-history` | `POST` | Summarize a session's event history |

### Real-time Audio/Video

| Route | Method | Purpose |
|---|---|---|
| `/api/livekit-token` | `GET` | Issue a LiveKit access token for screen/webcam sharing |
| `/api/turn-credentials` | `GET` | TURN server credentials for WebRTC NAT traversal |

### Email & Notifications

Transactional email via Resend, mostly triggered server-side.

| Route | Purpose |
|---|---|
| `/api/send` | Generic transactional email |
| `/api/send-critical-fail` / `/api/send-critical-success` | Natural 1 / natural 20 notification emails |
| `/api/sent-sign-up` | Welcome email on sign-up |
| `/api/session-reminder` | Upcoming session reminder |
| `/api/resend/preferences` | Manage email preferences |
| `/api/backfill-emails` | One-off backfill script for existing users |

### Misc

| Route | Purpose |
|---|---|
| `/api/import-noobles` | One-off content import |

---

## License

MIT — open source, contributions welcome.

---

*Developed for the tabletop RPG community.*
