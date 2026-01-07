# Migration des Effets vers R2

## ✅ Migration Terminée

Les effets visuels ont été migrés avec succès vers Cloudflare R2 le 2026-01-07.

## 📊 Détails de la Migration

- **48 fichiers Effect uploadés** :
  - 20 fichiers Cone (10 webm + 10 webp)
  - 28 fichiers Fireballs (14 webm + 14 webp)
- **URL de base R2** : `https://pub-6b6ff93daa684afe8aca1537c143add0.r2.dev/`
- **Chemin local** : `/Effect/`

## 🔧 Changements Apportés

### 1. Scripts
- ✅ Modifié `scripts/upload-assets-to-r2.ts` pour inclure le répertoire `Effect`

### 2. API Routes
- ✅ Créé `/src/app/api/effects/route.ts` - API pour récupérer les effets depuis R2

### 3. Hooks
- ✅ Créé `/src/hooks/map/useEffects.ts` - Hook React pour charger les effets
- ✅ Modifié `/src/hooks/map/useMeasurementSkins.ts` - Utilise maintenant les URLs R2
- ✅ Modifié `/src/hooks/map/useSkinVideo.ts` - Utilise maintenant les URLs R2

### 4. Components
- ✅ Modifié `/src/components/(map)/MapToolbar.tsx` - ToolbarSkinSelector utilise maintenant R2

## 🚀 Utilisation

### API Endpoint

```typescript
// Récupérer tous les effets
GET /api/effects

// Filtrer par catégorie (Cone ou Fireballs)
GET /api/effects?category=Cone
GET /api/effects?category=Fireballs

// Filtrer par type
GET /api/effects?type=video
GET /api/effects?type=image
```

### Hook React

```typescript
import { useEffects } from '@/hooks/map/useEffects';

// Dans un composant
const { effects, grouped, isLoading, error } = useEffects('Cone');

// Récupérer l'URL d'un effet
import { getEffectUrl } from '@/hooks/map/useEffects';
const url = getEffectUrl('Cone/cone1.webm', effects);
```

## 📝 Structure des Données

Chaque effet dans l'API retourne :

```typescript
{
  name: string;           // "cone1.webm"
  path: string;           // URL R2 complète
  localPath: string;      // "/Effect/Cone/cone1.webm"
  category: string;       // "Effect/Cone"
  type: "video" | "image"
}
```

## 🔄 Fallback

Le code inclut un fallback automatique vers les fichiers locaux (`/Effect/...`) si :
- Les effets n'ont pas encore été chargés depuis l'API
- Un effet n'est pas trouvé dans R2
- Une erreur se produit lors du chargement

## 🧪 Tests

Pour tester que tout fonctionne :

1. Démarrer le serveur de dev : `npm run dev`
2. Ouvrir une map avec l'outil de mesure
3. Vérifier que les skins d'effets se chargent correctement
4. Vérifier dans la console réseau que les URLs R2 sont utilisées

## 📦 Fichiers Uploadés

Les fichiers suivants ont été uploadés vers R2 :

### Cone Effects (20 fichiers)
- cone1.webm / cone1.webp
- cone2.webm / cone2.webp
- cone3.webm / cone3.webp
- cone4.webm / cone4.webp
- cone5.webm / cone5.webp
- cone6.webm / cone6.webp
- cone7.webm / cone7.webp
- cone8.webm / cone8.webp
- cone9.webm / cone9.webp
- cone10.webm / cone10.webp

### Fireball Effects (28 fichiers)
- explosion1-7.webm / explosion1-7.webp (14 fichiers)
- loop1-7.webm / loop1-7.webp (14 fichiers)
