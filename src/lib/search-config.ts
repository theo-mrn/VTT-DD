/**
 * Configuration pour la recherche sémantique
 * Dictionnaire de synonymes et termes sémantiquement proches
 */

export type SemanticMapping = {
    [key: string]: string[]
}

/**
 * Dictionnaire de synonymes et termes associés pour la recherche contextuelle
 * Format: terme principal → [synonymes, variantes, termes proches]
 */
export const SEMANTIC_MAPPINGS: SemanticMapping = {
    // Véhicules / Transport
    'carrosse': ['chariole', 'chariot', 'voiture', 'vehicule', 'cart', 'wagon'],
    'chariole': ['carrosse', 'chariot', 'charrette', 'cart', 'wagon', 'charriole'],
    'chariot': ['chariole', 'carrosse', 'charrette', 'cart', 'wagon'],
    'vehicule': ['carrosse', 'chariole', 'chariot', 'cart', 'wagon'],
    'cart': ['chariole', 'chariot', 'carrosse', 'wagon'],
    'wagon': ['chariole', 'chariot', 'carrosse', 'cart'],

    // Conteneurs
    'coffre': ['caisse', 'malle', 'chest', 'boite', 'conteneur'],
    'chest': ['coffre', 'caisse', 'malle', 'boite'],
    'caisse': ['coffre', 'chest', 'boite', 'malle', 'conteneur'],
    'malle': ['coffre', 'chest', 'caisse', 'boite'],
    'boite': ['coffre', 'chest', 'caisse', 'malle'],
    'conteneur': ['coffre', 'caisse', 'chest', 'malle'],

    // Tonneaux
    'tonneau': ['barrel', 'fut', 'barrique', 'baril'],
    'barrel': ['tonneau', 'fut', 'barrique', 'baril'],
    'barrique': ['tonneau', 'barrel', 'fut', 'baril'],
    'fut': ['tonneau', 'barrel', 'barrique', 'baril'],
    'baril': ['tonneau', 'barrel', 'barrique', 'fut'],

    // Sacs
    'sac': ['bag', 'sacoche', 'besace', 'poche'],
    'bag': ['sac', 'sacoche', 'besace', 'poche'],
    'sacoche': ['sac', 'bag', 'besace', 'poche'],
    'besace': ['sac', 'bag', 'sacoche', 'poche'],

    // Livres
    'livre': ['book', 'grimoire', 'ouvrage', 'tome', 'bouquin'],
    'book': ['livre', 'grimoire', 'ouvrage', 'tome'],
    'grimoire': ['livre', 'book', 'tome', 'ouvrage'],
    'tome': ['livre', 'book', 'grimoire', 'ouvrage'],

    // Clés
    'cle': ['key', 'clef'],
    'clef': ['key', 'cle'],
    'key': ['cle', 'clef'],

    // Échelles
    'echelle': ['ladder', 'escalier'],
    'ladder': ['echelle', 'escalier'],

    // Escaliers
    'escalier': ['stairs', 'echelle', 'marche', 'staircase'],
    'stairs': ['escalier', 'marche', 'staircase', 'escaliers'],
    'escaliers': ['stairs', 'staircase', 'escalier'],
    'staircase': ['escaliers', 'stairs', 'escalier'],
    'marche': ['escalier', 'stairs'],

    // Mobilier - Sièges
    'chaise': ['siege', 'chair', 'tabouret'],
    'chair': ['chaise', 'siege'],
    'siege': ['chaise', 'chair', 'fauteuil', 'tabouret'],
    'fauteuil': ['chaise', 'siege', 'chair'],
    'tabouret': ['chaise', 'siege', 'chair'],

    // Mobilier - Tables
    'table': ['bureau', 'desk', 'meuble'],
    'bureau': ['table', 'desk', 'meuble'],
    'desk': ['bureau', 'table', 'meuble'],

    // Mobilier - Lits
    'lit': ['bed', 'couche', 'couchette'],
    'bed': ['lit', 'couche', 'couchette'],
    'couche': ['lit', 'bed', 'couchette'],

    // Mobilier - Autres
    'miroir': ['mirror', 'glace'],
    'mirror': ['miroir', 'glace'],
    'glace': ['miroir', 'mirror', 'ice', 'freeze', 'frost'],
    'baignoire': ['bath', 'bain'],
    'bath': ['baignoire', 'bain'],
    'bain': ['baignoire', 'bath'],

    // Instruments de musique
    'piano': ['instrument', 'clavier'],
    'orgue': ['instrument', 'organ'],
    'organ': ['orgue', 'instrument'],
    'instrument': ['piano', 'orgue', 'organ'],

    // Végétation
    'arbre': ['tree', 'vegetation', 'plante'],
    'tree': ['arbre', 'vegetation'],
    'plante': ['plant', 'vegetation', 'fleur'],
    'plant': ['plante', 'vegetation'],
    'vegetation': ['plante', 'arbre', 'tree', 'plant'],

    // Feu
    'feu': ['fire', 'flamme', 'brasier'],
    'fire': ['feu', 'flamme', 'brasier'],
    'flamme': ['feu', 'fire', 'brasier'],
    'brasier': ['feu', 'fire', 'flamme'],

    // Équipement culinaire
    'four': ['oven', 'cuisiniere'],
    'oven': ['four', 'cuisiniere'],

    // Décorations
    'tapis': ['carpet', 'rug'],
    'carpet': ['tapis', 'rug'],
    'rug': ['tapis', 'carpet'],
    'decoration': ['ornement', 'decoration'],
    'ornement': ['decoration', 'ornement'],

    // Bois
    'bois': ['wood', 'planche', 'poutre'],
    'wood': ['bois', 'planche'],
    'planche': ['bois', 'wood', 'poutre'],
    'poutre': ['bois', 'planche', 'wood'],

    // Matériaux organiques
    'foin': ['hay', 'paille'],
    'hay': ['foin', 'paille'],
    'paille': ['foin', 'hay'],

    // Objets sombres/macabres
    'cercueil': ['coffin', 'sarcophage'],
    'coffin': ['cercueil', 'sarcophage'],
    'sarcophage': ['cercueil', 'coffin'],
    'ossement': ['os', 'bone', 'squelette'],
    'os': ['ossement', 'bone', 'squelette'],
    'bone': ['ossement', 'os', 'squelette'],
    'squelette': ['ossement', 'os', 'bone'],

    // Magasin
    'shop': ['magasin', 'boutique', 'commerce'],
    'magasin': ['shop', 'boutique', 'commerce'],
    'boutique': ['shop', 'magasin', 'commerce'],
    'commerce': ['shop', 'magasin', 'boutique'],

    // === SONS / SOUNDS ===

    // Nature - Eau
    'riviere': ['eau', 'water', 'ruisseau', 'river', 'stream'],
    'eau': ['riviere', 'water', 'ruisseau', 'river'],
    'water': ['eau', 'riviere', 'river', 'stream'],
    'river': ['riviere', 'eau', 'water', 'ruisseau'],
    'ruisseau': ['riviere', 'eau', 'stream', 'water'],
    'stream': ['ruisseau', 'riviere', 'water'],

    // Nature - Météo
    'pluie': ['rain', 'orage', 'storm'],
    'rain': ['pluie', 'storm', 'orage'],
    'orage': ['storm', 'pluie', 'rain', 'tonnerre', 'thunder'],
    'storm': ['orage', 'pluie', 'rain', 'thunder'],
    'tonnerre': ['thunder', 'orage', 'storm'],
    'thunder': ['tonnerre', 'orage', 'storm'],
    'vent': ['wind', 'breeze', 'brise'],
    'wind': ['vent', 'breeze', 'brise'],
    'brise': ['breeze', 'vent', 'wind'],
    'breeze': ['brise', 'vent', 'wind'],

    // Nature - Végétation et feu
    'foret': ['forest', 'bois', 'wood', 'nature'],
    'forest': ['foret', 'woods', 'nature'],
    'woods': ['foret', 'forest', 'bois'],
    'insecte': ['insect', 'bug'],
    'insect': ['insecte', 'bug'],
    'bug': ['insecte', 'insect'],
    'camp': ['campfire', 'feu de camp'],
    'campfire': ['camp', 'feu de camp', 'feu'],

    // Créatures - Dragons
    'dragon': ['wyrm', 'drake'],
    'wyrm': ['dragon', 'drake'],
    'drake': ['dragon', 'wyrm'],
    'ailes': ['wings', 'vol', 'fly'],
    'wings': ['ailes', 'vol', 'fly'],
    'vol': ['flight', 'wings', 'ailes', 'fly'],
    'flight': ['vol', 'wings', 'fly'],
    'fly': ['vol', 'flight', 'wings', 'ailes'],

    // Créatures - Monstres
    'gobelin': ['goblin', 'orc', 'orque'],
    'goblin': ['gobelin', 'orc', 'orque'],
    'orque': ['orc', 'goblin', 'gobelin', 'ogre'],
    'orc': ['orque', 'goblin', 'gobelin', 'ogre'],
    'ogre': ['orque', 'orc', 'troll'],
    'troll': ['ogre', 'monstre', 'monster'],
    'monstre': ['monster', 'creature', 'bete'],
    'monster': ['monstre', 'creature', 'beast'],
    'creature': ['monstre', 'monster', 'beast', 'bete'],
    'beast': ['bete', 'monstre', 'creature'],
    'bete': ['beast', 'monstre', 'creature'],

    // Créatures - Canidés
    'loup': ['wolf', 'worg', 'chien'],
    'wolf': ['loup', 'worg'],
    'worg': ['loup', 'wolf', 'chien'],
    'chien': ['dog', 'worg', 'loup'],
    'dog': ['chien', 'worg'],
    'aboiement': ['bark', 'howl', 'hurlement'],
    'bark': ['aboiement', 'howl'],
    'hurlement': ['howl', 'aboiement', 'cry'],
    'howl': ['hurlement', 'aboiement'],

    // Sons de créatures
    'grognement': ['growl', 'snarl'],
    'growl': ['grognement', 'snarl'],
    'snarl': ['grognement', 'growl'],
    'rire': ['laugh', 'laughter'],
    'laugh': ['rire', 'laughter'],
    'laughter': ['rire', 'laugh'],

    // Foule et ambiance urbaine
    'foule': ['crowd', 'people', 'public'],
    'crowd': ['foule', 'people', 'public'],
    'people': ['foule', 'crowd', 'public'],
    'public': ['foule', 'crowd', 'people'],
    'taverne': ['tavern', 'inn', 'auberge', 'bar'],
    'tavern': ['taverne', 'inn', 'auberge', 'bar'],
    'inn': ['auberge', 'taverne', 'tavern'],
    'auberge': ['inn', 'taverne', 'tavern'],
    'bar': ['taverne', 'tavern', 'inn'],

    // Combat - Armes à distance
    'fleche': ['arrow', 'arc', 'bow'],
    'arrow': ['fleche', 'bow', 'arc'],
    'arc': ['bow', 'fleche', 'arrow'],
    'bow': ['arc', 'fleche', 'arrow'],

    // Combat - Armes de mêlée
    'epee': ['sword', 'lame', 'blade'],
    'sword': ['epee', 'lame', 'blade'],
    'lame': ['blade', 'epee', 'sword'],
    'blade': ['lame', 'epee', 'sword'],
    'hache': ['axe', 'hatchet'],
    'axe': ['hache', 'hatchet'],
    'hatchet': ['hache', 'axe'],
    'bouclier': ['shield'],
    'shield': ['bouclier'],

    // Combat - Actions
    'degainer': ['unsheathe', 'draw'],
    'unsheathe': ['degainer', 'draw'],
    'draw': ['degainer', 'unsheathe'],
    'impact': ['hit', 'strike', 'coup'],
    'hit': ['impact', 'strike', 'coup'],
    'strike': ['impact', 'hit', 'coup'],
    'coup': ['hit', 'strike', 'impact', 'punch'],
    'punch': ['coup', 'poing', 'hit'],
    'poing': ['punch', 'coup', 'fist'],
    'fist': ['poing', 'punch'],
    'armure': ['armor', 'armour'],
    'armor': ['armure', 'armour'],
    'armour': ['armure', 'armor'],

    // Magie
    'sort': ['spell', 'magie', 'magic'],
    'spell': ['sort', 'magie', 'magic'],
    'magie': ['magic', 'sort', 'spell'],
    'magic': ['magie', 'sort', 'spell'],
    'electricite': ['electricity', 'lightning', 'eclair'],
    'electricity': ['electricite', 'lightning', 'eclair'],
    'lightning': ['eclair', 'electricite', 'electricity'],
    'eclair': ['lightning', 'electricite', 'thunder'],
    'ice': ['glace', 'freeze', 'frost'],
    'freeze': ['glace', 'ice', 'frost'],
    'frost': ['glace', 'ice', 'freeze'],
    'resurrection': ['resurection', 'revive', 'revival'],
    'revive': ['resurrection', 'revival'],
    'revival': ['resurrection', 'revive'],

    // Mouvement
    'pas': ['footstep', 'footsteps', 'step', 'walk'],
    'footstep': ['pas', 'step', 'walk'],
    'footsteps': ['pas', 'step', 'walk'],
    'step': ['pas', 'footstep', 'walk'],
    'walk': ['pas', 'footstep', 'marche'],
    'marcher': ['walk', 'walking'],
    'walking': ['marcher', 'walk'],
    'courir': ['run', 'running'],
    'run': ['courir', 'running'],
    'running': ['courir', 'run'],
    'couloir': ['hallway', 'corridor'],
    'hallway': ['couloir', 'corridor'],
    'corridor': ['couloir', 'hallway'],
    'parquet': ['floor', 'wood floor'],
    'floor': ['parquet', 'sol'],
    'sol': ['floor', 'ground'],
    'ground': ['sol', 'floor'],
    'lourd': ['heavy', 'loud'],
    'heavy': ['lourd', 'loud'],
    'loud': ['lourd', 'heavy', 'fort'],
    'fort': ['loud', 'strong', 'lourd'],
    'discret': ['stealthy', 'quiet', 'sneaky'],
    'stealthy': ['discret', 'sneaky', 'quiet'],
    'sneaky': ['discret', 'stealthy', 'quiet'],
    'quiet': ['discret', 'silencieux', 'silent'],
    'silencieux': ['quiet', 'silent', 'discret'],
    'silent': ['silencieux', 'quiet'],

    // Portes et accès
    'porte': ['door', 'gate'],
    'door': ['porte', 'gate'],
    'gate': ['porte', 'door'],
    'ouverture': ['opening', 'open'],
    'opening': ['ouverture', 'open'],
    'open': ['ouverture', 'opening', 'ouvrir'],
    'ouvrir': ['open', 'opening'],
    'fermeture': ['closing', 'close'],
    'closing': ['fermeture', 'close'],
    'close': ['fermeture', 'closing', 'fermer'],
    'fermer': ['close', 'closing'],
    'verrou': ['lock', 'locked'],
    'lock': ['verrou', 'locked', 'serrure'],
    'locked': ['verrou', 'lock', 'verrouille'],
    'verrouille': ['locked', 'lock', 'verrou'],
    'serrure': ['lock', 'keyhole'],
    'keyhole': ['serrure', 'lock'],

    // Objets divers
    'cles': ['keys', 'key'],
    'keys': ['cles', 'key'],
    'corne': ['horn', 'cor'],
    'horn': ['corne', 'cor'],
    'cor': ['horn', 'corne'],
    'pieces': ['coins', 'money', 'argent'],
    'coins': ['pieces', 'money', 'monnaie'],
    'money': ['argent', 'pieces', 'coins'],
    'argent': ['money', 'coins', 'pieces'],
    'monnaie': ['coins', 'money', 'pieces'],
    'sonnette': ['bell', 'cloche'],
    'bell': ['sonnette', 'cloche'],
    'cloche': ['bell', 'sonnette'],
}

/**
 * Normalise une chaîne de caractères pour la recherche
 * - Supprime les accents
 * - Met en minuscules
 * - Supprime les espaces multiples
 */
export function normalizeString(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') // Normalise les espaces
}

/**
 * Récupère tous les termes sémantiquement liés à un terme donné
 * Inclut le terme lui-même et tous ses synonymes/variantes
 */
export function getSemanticTerms(term: string): string[] {
    const normalized = normalizeString(term)
    const relatedTerms = SEMANTIC_MAPPINGS[normalized] || []

    // Retourne le terme original + tous les termes associés (normalisés)
    return [normalized, ...relatedTerms.map(normalizeString)]
}

/**
 * Vérifie si deux termes sont sémantiquement liés
 */
export function areSemanticallySimilar(term1: string, term2: string): boolean {
    const normalized1 = normalizeString(term1)
    const normalized2 = normalizeString(term2)

    if (normalized1 === normalized2) return true

    const relatedTerms1 = getSemanticTerms(normalized1)
    const relatedTerms2 = getSemanticTerms(normalized2)

    // Vérifie si term2 est dans les termes liés à term1 ou vice-versa
    return relatedTerms1.includes(normalized2) || relatedTerms2.includes(normalized1)
}
