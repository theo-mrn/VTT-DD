# Upload des Assets de Dés vers R2

Ce document explique comment uploader les assets de dés (textures et previews) vers Cloudflare R2.

## Scripts Disponibles

### 1. Script Principal (tous les assets)
```bash
npx tsx scripts/upload-assets-to-r2.ts
```
Upload tous les assets du projet, incluant les dés.

### 2. Script Dédié (dés uniquement)
```bash
npx tsx scripts/upload-dice-assets-to-r2.ts
```
Upload uniquement les assets de dés (38 fichiers, 12.77 MB).

## Assets de Dés

### Textures (9 fichiers)
- `textures/bark_diffuse.png`
- `textures/ice_diffuse.png`
- `textures/lava_diffuse.png`
- `textures/leather_diffuse.png`
- `textures/marble_diffuse.png`
- `textures/parchment_diffuse.png`
- `textures/rust_diffuse.png`
- `textures/stone_diffuse.png`
- `textures/wood_diffuse.png`

### Previews (29 fichiers)
Tous les skins de dés dans `dice-previews/` :
- gold, silver, ruby, obsidian, jade, crystal, sapphire, amethyst
- inferno, frost, cyber_neon, ancient_bone, void_walker
- celestial_starlight, blood_pact, steampunk_copper, royal_marble
- galactic_nebula, dragon_scale, moonstone, bois_noble
- marbre_blanc, cuir_ancien, pierre_donjon, fer_rouille
- roche_volcanique, glace_eternelle, ecorce_ancienne, parchemin_ancien

## Utilisation

### Test (Dry-Run)
```bash
npx tsx scripts/upload-dice-assets-to-r2.ts --dry-run
```
Affiche les fichiers qui seraient uploadés sans effectuer l'upload.

### Upload Réel
```bash
npx tsx scripts/upload-dice-assets-to-r2.ts
```

## Configuration Requise

Variables d'environnement dans `.env.local` :
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

## Résultat

Après l'upload :
- Les fichiers sont disponibles sur R2
- `public/asset-mappings.json` est mis à jour avec les URLs R2
- Les assets sont servis via le CDN Cloudflare
