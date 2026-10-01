/**
 * Carte d'environnement des dés (reflets des métaux), locale : le preset
 * « city » de drei (potsdamer_platz_1k.hdr, 1024×512, 1,5 Mo téléchargés sur
 * un CDN) réduit à 256×128 par moyenne de blocs, même luminance moyenne. Le
 * PMREM en est seize fois moins coûteux (cube de 64 au lieu de 256),
 * invisible sur des dés de cette taille.
 */
export const DICE_ENVIRONMENT = '/dice/environment-city.hdr';
