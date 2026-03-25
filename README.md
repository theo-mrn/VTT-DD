# VTT-DD — Virtual Tabletop for Dungeons & Dragons

A full-featured, real-time Virtual Tabletop platform built for Dungeons & Dragons campaigns. Designed for Game Masters and players who want a modern, immersive, and highly customizable online tabletop experience.

> Built with Next.js 15, TypeScript, Firebase, and Three.js.

---

## Overview

VTT-DD provides everything needed to run a complete D&D campaign online — from interactive maps with fog of war to synchronized audio, character sheets, dice rolling, and turn-based combat — all in real time across all connected players.

---

## Features

### Interactive Map
- Zoomable, pannable map canvas with a toggleable grid
- Drag & drop token placement for players and NPCs
- Fog of war system with customizable visibility radius per character
- Line-of-sight blocking via obstacles (walls, closed rooms, doors, windows)
- Light zones that illuminate surrounding fog
- Free drawing and text annotations (GM only)
- Multiple scenes per campaign — GM navigates freely, players are assigned to scenes
- Layer system: toggle visibility of objects, obstacles, fog, text, drawings, NPCs, etc.
- Portal system to link scenes or teleport within a scene
- Spawn point definition per scene
- Player cursor tracking

### Characters & Character Sheets
- Full D&D character sheets: FOR, DEX, CON, SAG, INT, CHA and all combat stats
- Customizable layout: freely resize and reposition blocks, choose colors, fonts, borders
- Custom fields: define new fields as modifiers or plain values, mark as dice-eligible
- Level-up system with Constitution roll
- Stat comparison view across all party members
- Token customization: cropping, borders, decorations
- Avatar library by race (Human, Elf, Dwarf, Orc, Dragonborn, Minotaur, Halfling) + custom upload
- Character sheets visible to all party members (read-only for others)

### Inventory
- Add, rename, remove items and manage quantities
- Define item bonuses (e.g. Armor +3 DEF)
- Toggle bonuses on/off contextually

### Skills & Abilities
- Skill trees with unlock paths (2 points per level)
- Activate/deactivate skills and their associated bonuses
- Manually edit skill bonuses and paths
- Add custom paths and modify skills within a path

### Dice System
- Standard dice (d4, d6, d8, d10, d12, d20, d100) and custom dice (e.g. d17)
- Complex formula support via `@dice-roller/rpg-dice-roller`
- 3D dice with toggleable animation
- Roll visibility: public, private (player + GM), or hidden (GM only)
- Per-player roll history with filtering and statistics
- Dice skin shop (cosmetic, unlockable)

### Combat
- Turn-by-turn initiative tracker
- Attack types: Melee, Ranged, Magic — select weapon from inventory
- Apply, modify, or reject incoming damage before confirming
- Status effects: Fatigue, Blind, etc.
- Area attacks: zones, cones, lines with auto-targeting
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
- Encounter generator

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS |
| UI | shadcn/ui, Radix UI, Framer Motion, GSAP |
| 3D | Three.js |
| Backend | Firebase Auth, Firestore, Realtime Database, Firebase Storage |
| Payments | Stripe |
| Dice | `@dice-roller/rpg-dice-roller` |
| Audio/Video | YouTube API, Web Audio API |
| Email | React Email |
| Observability | OpenTelemetry |

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
npm run dev
```

App available at `http://localhost:3000`

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
│   └── tabs/            # Skill data (JSON)
└── src/
    ├── app/
    │   ├── [roomid]/    # Game room pages
    │   │   ├── map/     # Interactive map
    │   │   └── scenario/
    │   ├── auth/
    │   ├── creation/
    │   ├── home/
    │   ├── mes-campagnes/
    │   ├── modules/     # Feature modules (map, combat, dice, chat, audio, etc.)
    │   ├── personnages/
    │   ├── profile/
    │   └── ressources/
    ├── components/
    │   ├── ui/          # shadcn/ui base components
    │   ├── (map)/       # Map components
    │   ├── (combat)/    # Combat system
    │   ├── (dices)/     # Dice roller
    │   ├── (chat)/      # Chat
    │   ├── (music)/     # Synced audio player
    │   ├── (fiches)/    # Character sheets
    │   ├── (inventaire)/
    │   ├── (competences)/
    │   └── ...
    ├── contexts/
    │   ├── GameContext.tsx
    │   └── CompetencesContext.tsx
    └── lib/
        ├── firebase.js
        └── utils.ts
```

---

## External API

VTT-DD exposes a REST API so external tools, bots, and scripts can interact with the platform programmatically.

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

---

## Discord Bot

VTT-DD ships a Discord bot that bridges your server with the VTT. Rolls made on Discord are saved directly to your room's history, and stat modifiers are pulled automatically from your linked character.

**[Add the bot to your server](https://discord.com/oauth2/authorize?client_id=1486015721740959794&permissions=2147502080&integration_type=0&scope=bot+applications.commands)**

### Linking your account

Link once using your VTT credentials or an existing API key — all responses are ephemeral (visible only to you):

```
/login email:you@example.com password:****
/link api_key:vtt_...
```

Once linked, the bot resolves your character name, active room, and stat modifiers automatically.

```
/unlink    — remove the link between your Discord and VTT accounts
```

### Rolling dice

```
/roll notation:1d20
/roll notation:2d6+FOR
/roll notation:4d6kh3
```

- Stat variables (`FOR`, `DEX`, `CON`, etc.) are resolved from your linked character
- Results are posted as a rich embed with critical hit / fumble detection
- If you are in an active room, the roll is saved to the room's history in real time


---

## Module SDK

VTT-DD supports a plugin system that lets developers extend the VTT with new features without touching the core codebase.

Modules can add panels to the sidebar, listen to game events (dice rolls, combat turns, chat messages), persist data per room in Firebase, and inject UI into character sheets or context menus.

The SDK is exposed at `window.__VTT_SDK__` once the app is loaded.

### Writing a Module

Create a `.js` file, host it anywhere, and paste the URL into the module manager:

```js
// my-module.js
(function () {
  const sdk = window.__VTT_SDK__;
  if (!sdk) return;

  sdk.register({
    id: 'my-module',
    name: 'My Module',
    version: '1.0.0',
    description: 'A short description.',
    type: 'feature',           // 'feature' | 'game-system' | 'content'
    defaultEnabled: true,

    init(ctx) {
      // ctx.events, ctx.store, ctx.ui, ctx.room
      ctx.events.on('dice:rolled', (roll) => {
        console.log('Roll result:', roll.total);
      });

      ctx.ui.addSidebarPanel({
        id: 'my-panel',
        label: 'My Panel',
        render: () => { /* return a DOM element */ }
      });
    }
  });
})();
```

### Module Manifest Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Unique identifier across the platform |
| `name` | `string` | yes | Display name |
| `version` | `string` | yes | Semver string |
| `description` | `string` | yes | Short description |
| `type` | `"feature" \| "game-system" \| "content"` | yes | Module category |
| `dependencies` | `string[]` | — | IDs of modules to load before this one |
| `defaultEnabled` | `boolean` | — | Auto-enable after install |
| `requiresMJ` | `boolean` | — | Restrict activation to the GM |

---

## License

MIT — open source, contributions welcome.

---

*Developed for the tabletop RPG community.*
