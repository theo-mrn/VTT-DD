/**
 * Icône lucide désignée par son nom kebab-case (`trending-up`), pour les
 * symboles dessinés sur les faces des dés à symboles (`face-symbol.tsx`).
 * Chargé à la demande : tout le jeu d'icônes ne part qu'avec un dé à symboles.
 */
import { icons, type LucideProps } from 'lucide-react';

/** `trending-up` → `TrendingUp`, clé de l'export `icons` de lucide-react. */
function componentName(icon: string): string {
  return icon
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join('');
}

/** `null` si l'icône n'existe pas. */
export function LucideIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = icons[componentName(name) as keyof typeof icons];
  return Icon ? <Icon {...props} /> : null;
}
