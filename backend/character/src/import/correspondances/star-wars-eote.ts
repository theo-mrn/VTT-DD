/**
 * Star Wars — Aux confins de l'Empire : identifiants legacy → nouveaux ids.
 *
 * Généré une fois depuis legacy/starwars-bundle/table.json (le bundle importé
 * dans les salles), legacy/talents-arbres.json et le système
 * packages/systemes/systemes/star-wars-eote, puis relu :
 *  - carrières et spécialisations appariées par leur nom VO (« VO : Bounty
 *    Hunter. » dans la description du nouveau catalogue) ;
 *  - compétences dans l'ordre du bundle, caractéristique liée vérifiée une à une ;
 *  - espèces : même id, `_` devenu `-` (9 espèces, liste ci-dessous) ;
 *  - nœuds d'arbre appariés par position (x, y) dans l'arbre de la même
 *    spécialisation, titre VO du talent vérifié pour les 360 nœuds.
 */

/** Carrière (`Profile` / `career`) → carrière. */
export const CARRIERES: Readonly<Record<string, string>> = {
  bounty_hunter: 'chasseur-de-primes',
  colonist: 'colon',
  explorer: 'explorateur',
  hired_gun: 'mercenaire',
  smuggler: 'contrebandier',
  technician: 'technicien',
};

/** Compétence (clés de `skillRanks`, `careerSkillChoices`…) → compétence. */
export const COMPETENCES: Readonly<Record<string, string>> = {
  athletics: 'athletisme',
  coordination: 'coordination',
  discipline: 'discipline',
  perception: 'perception',
  resilience: 'resistance',
  streetwise: 'sens-de-la-rue',
  cool: 'sang-froid',
  vigilance: 'vigilance',
  deception: 'tromperie',
  charm: 'charme',
  negotiation: 'negociation',
  skulduggery: 'magouilles',
  stealth: 'discretion',
  coercion: 'coercition',
  leadership: 'commandement',
  computers: 'informatique',
  mechanics: 'mecanique',
  medicine: 'medecine',
  survival: 'survie',
  gunnery: 'artillerie',
  brawl: 'corps-a-corps',
  melee: 'melee',
  ranged_light: 'distance-legere',
  ranged_heavy: 'distance-lourde',
  piloting_planetary: 'pilotage-planetaire',
  piloting_space: 'pilotage-spatial',
  astrogation: 'astrogation',
  knowledge_core_worlds: 'connaissance-noyau',
  knowledge_education: 'connaissance-education',
  knowledge_lore: 'connaissance-traditions',
  knowledge_outer_rim: 'connaissance-bordure',
  knowledge_underworld: 'connaissance-pegre',
  knowledge_xenology: 'connaissance-xenologie',
};

/**
 * Espèces (`Race`) : les 100 espèces gardent leur id, sauf ces 9 où `_` est
 * devenu `-`. Un id absent de cette table est cherché tel quel, puis avec
 * `_` → `-` (espèces ajoutées par un MJ après l'export du bundle).
 */
export const ESPECES: Readonly<Record<string, string>> = {
  sith_sang_pur: 'sith-sang-pur',
  espece_de_yoda: 'espece-de-yoda',
  presque_humain: 'presque-humain',
  yuuzhan_vong: 'yuuzhan-vong',
  mon_calamari: 'mon-calamari',
  kel_dor: 'kel-dor',
  ishi_tib: 'ishi-tib',
  nu_cosian: 'nu-cosian',
  pho_pheahian: 'pho-pheahian',
};

/**
 * Spécialisation, par son nom VO (`name` du document de contenu) →
 * spécialisation. Les personnages ne portent que l'id Firestore (aléatoire)
 * du document : il faut l'export de `gameSystems/{id}/content`, ou déduire la
 * spécialisation des nœuds acquis (préfixe des ids de nœud, voir NOEUDS).
 */
export const SPECIALISATIONS: Readonly<Record<string, string>> = {
  Assassin: 'assassin',
  Gadgeteer: 'bricoleur',
  Survivalist: 'survivaliste',
  Doctor: 'medecin',
  Politico: 'politicien',
  Scholar: 'erudit',
  Fringer: 'vagabond',
  Scout: 'eclaireur',
  Trader: 'marchand',
  Bodyguard: 'garde-du-corps',
  Marauder: 'maraudeur',
  'Mercenary Soldier': 'soldat-mercenaire',
  Pilot: 'pilote',
  Scoundrel: 'canaille',
  Thief: 'voleur',
  Mechanic: 'mecanicien',
  'Outlaw Tech': 'technicien-hors-la-loi',
  Slicer: 'pirate-informatique',
};

/**
 * Équipement dont le nom a été traduit (nom VO du bundle, en `slug`) →
 * entrée. Les autres objets du bundle gardent leur nom français : ils sont
 * retrouvés par le nom (`message`) dans le catalogue.
 */
export const EQUIPEMENT: Readonly<Record<string, string>> = {
  'tensor-rifle': 'fusil-tenseur',
  'sonic-blaster-rifle': 'fusil-blaster-sonique',
  'stunpulse-cannon': 'canon-a-impulsion-etourdissante',
  'jawamake-flechette-cannon': 'canon-a-flechettes-jawa',
  'jawamake-incendiary-target-pistol': 'pistolet-de-tir-incendiaire-jawa',
  'bladed-flashpistol': 'pistolet-flash-a-lame',
  'wrist-mounted-concussion-mini-grenade-launcher': 'mini-lance-grenades-a-concussion-de-poignet',
  'permacrete-detonator': 'detonateur-a-permabeton',
  'flash-mine': 'mine-flash',
  'sonic-mine': 'mine-sonique',
  'mm9-rocket-system': 'systeme-de-roquettes-mm9',
  'whipcord-launcher': 'lance-filin',
  vibrowhip: 'vibrofouet',
  'electroblade-training-sword': 'epee-d-entrainement-electrolame',
};

/**
 * Type d'Obligation deviné depuis le texte libre saisi par le joueur (`text`),
 * après `slug`. Premier motif trouvé ; à défaut, OBLIGATION_PAR_DEFAUT, avec
 * un avertissement (le texte est conservé dans le champ « détail »).
 */
export const OBLIGATIONS: readonly (readonly [RegExp, string])[] = [
  [/dependan|addict|drogue|accro|spice|epice|jeu-d-argent|sabacc/, 'dependance'],
  [/trahi|vengean/, 'trahison'],
  [/chantage|secret/, 'chantage'],
  [/prime|chasseur|recherche|mise-a-prix/, 'prime'],
  [/criminel|crime|casier|hors-la-loi|evade|fugitif/, 'criminel'],
  [/dette|doit|argent|credit|hutt|emprunt|preteur/, 'dette'],
  [/devoir|mission|ordre|militaire|rebellion|empire/, 'devoir'],
  [/famille|frere|soeur|pere|mere|enfant|fils|fille|parent|clan/, 'famille'],
  [/faveur|service-rendu/, 'faveur'],
  [/serment|jure|promesse|voeu|code/, 'serment'],
  [/obsession|obsede/, 'obsession'],
  [/responsabilit|protege|charge/, 'responsabilite'],
];

/** Choix arbitraire : la Dette est l'Obligation la plus courante du livre de base. */
export const OBLIGATION_PAR_DEFAUT = 'dette';

/**
 * Nœud d'arbre de talents (clés des `unlockedTalents`) → `arbre/nœud`.
 * Les ids legacy sont uniques d'un arbre à l'autre (préfixés par la
 * spécialisation VO) : la spécialisation se déduit aussi de l'arbre.
 */
export const NOEUDS: Readonly<Record<string, string>> = {
  // arbre-assassin
  'assassin-grit': 'arbre-assassin/l1c1', // Grit → cran
  'assassin-lethal-blows-1': 'arbre-assassin/l1c2', // Lethal Blows → coups-mortels
  'assassin-stalker-1': 'arbre-assassin/l1c3', // Stalker → traqueur
  'assassin-dodge-1': 'arbre-assassin/l1c4', // Dodge → esquive
  'assassin-precise-aim-1': 'arbre-assassin/l2c1', // Precise Aim → visee-precise
  'assassin-jump-up': 'arbre-assassin/l2c2', // Jump Up → debout
  'assassin-quick-strike': 'arbre-assassin/l2c3', // Quick Strike → frappe-rapide
  'assassin-quick-draw': 'arbre-assassin/l2c4', // Quick Draw → degainer-rapide
  'assassin-targeted-blow': 'arbre-assassin/l3c1', // Targeted Blow → coup-cible
  'assassin-stalker-2': 'arbre-assassin/l3c2', // Stalker → traqueur
  'assassin-lethal-blows-2': 'arbre-assassin/l3c3', // Lethal Blows → coups-mortels
  'assassin-anatomy-lessons': 'arbre-assassin/l3c4', // Anatomy Lessons → lecons-d-anatomie
  'assassin-stalker-3': 'arbre-assassin/l4c1', // Stalker → traqueur
  'assassin-sniper-shot': 'arbre-assassin/l4c2', // Sniper Shot → tir-de-precision
  'assassin-dodge-2': 'arbre-assassin/l4c3', // Dodge → esquive
  'assassin-lethal-blows-3': 'arbre-assassin/l4c4', // Lethal Blows → coups-mortels
  'assassin-precise-aim-2': 'arbre-assassin/l5c1', // Precise Aim → visee-precise
  'assassin-deadly-accuracy': 'arbre-assassin/l5c2', // Deadly Accuracy → precision-mortelle
  'assassin-dedication': 'arbre-assassin/l5c3', // Dedication → devouement
  'assassin-master-of-shadows': 'arbre-assassin/l5c4', // Master of Shadows → maitre-des-ombres
  // arbre-bricoleur
  'gadgeteer-brace': 'arbre-bricoleur/l1c1', // Brace → arc-boute
  'gadgeteer-toughened-1': 'arbre-bricoleur/l1c2', // Toughened → endurci
  'gadgeteer-intimidating-1': 'arbre-bricoleur/l1c3', // Intimidating → intimidant
  'gadgeteer-defensive-stance': 'arbre-bricoleur/l1c4', // Defensive Stance → posture-defensive
  'gadgeteer-spare-clip': 'arbre-bricoleur/l2c1', // Spare Clip → chargeur-de-rechange
  'gadgeteer-jury-rigged-1': 'arbre-bricoleur/l2c2', // Jury Rigged → rafistolage
  'gadgeteer-point-blank': 'arbre-bricoleur/l2c3', // Point Blank → bout-portant
  'gadgeteer-disorient': 'arbre-bricoleur/l2c4', // Disorient → desorientation
  'gadgeteer-toughened-2': 'arbre-bricoleur/l3c1', // Toughened → endurci
  'gadgeteer-armor-master-1': 'arbre-bricoleur/l3c2', // Armor Master → maitre-des-armures
  'gadgeteer-natural-enforcer': 'arbre-bricoleur/l3c3', // Natural Enforcer → gros-bras-ne
  'gadgeteer-stunning-blow': 'arbre-bricoleur/l3c4', // Stunning Blow → coup-etourdissant
  'gadgeteer-jury-rigged-2': 'arbre-bricoleur/l4c1', // Jury Rigged → rafistolage
  'gadgeteer-tinkerer': 'arbre-bricoleur/l4c2', // Tinkerer → bidouilleur
  'gadgeteer-deadly-accuracy': 'arbre-bricoleur/l4c3', // Deadly Accuracy → precision-mortelle
  'gadgeteer-improved-stunning-blow': 'arbre-bricoleur/l4c4', // Improved Stunning Blow → coup-etourdissant-ameliore
  'gadgeteer-intimidating-2': 'arbre-bricoleur/l5c1', // Intimidating → intimidant
  'gadgeteer-dedication': 'arbre-bricoleur/l5c2', // Dedication → devouement
  'gadgeteer-improved-armor-master': 'arbre-bricoleur/l5c3', // Improved Armor Master → maitre-des-armures-ameliore
  'gadgeteer-crippling-blow': 'arbre-bricoleur/l5c4', // Crippling Blow → coup-handicapant
  // arbre-survivaliste
  'survivalist-forager': 'arbre-survivaliste/l1c1', // Forager → fourrageur
  'survivalist-stalker-1': 'arbre-survivaliste/l1c2', // Stalker → traqueur
  'survivalist-outdoorsman-1': 'arbre-survivaliste/l1c3', // Outdoorsman → baroudeur
  'survivalist-expert-tracker-1': 'arbre-survivaliste/l1c4', // Expert Tracker → pisteur-expert
  'survivalist-outdoorsman-2': 'arbre-survivaliste/l2c1', // Outdoorsman → baroudeur
  'survivalist-swift': 'arbre-survivaliste/l2c2', // Swift → agile
  'survivalist-hunter-1': 'arbre-survivaliste/l2c3', // Hunter → chasseur
  'survivalist-soft-spot': 'arbre-survivaliste/l2c4', // Soft Spot → point-faible
  'survivalist-toughened-1': 'arbre-survivaliste/l3c1', // Toughened → endurci
  'survivalist-expert-tracker-2': 'arbre-survivaliste/l3c2', // Expert Tracker → pisteur-expert
  'survivalist-stalker-2': 'arbre-survivaliste/l3c3', // Stalker → traqueur
  'survivalist-natural-outdoorsman': 'arbre-survivaliste/l3c4', // Natural Outdoorsman → baroudeur-ne
  'survivalist-toughened-2': 'arbre-survivaliste/l4c1', // Toughened → endurci
  'survivalist-hunter-2': 'arbre-survivaliste/l4c2', // Hunter → chasseur
  'survivalist-expert-tracker-3': 'arbre-survivaliste/l4c3', // Expert Tracker → pisteur-expert
  'survivalist-blooded': 'arbre-survivaliste/l4c4', // Blooded → sang-epais
  'survivalist-enduring': 'arbre-survivaliste/l5c1', // Enduring → endurant
  'survivalist-dedication': 'arbre-survivaliste/l5c2', // Dedication → devouement
  'survivalist-grit': 'arbre-survivaliste/l5c3', // Grit → cran
  'survivalist-heroic-fortitude': 'arbre-survivaliste/l5c4', // Heroic Fortitude → courage-heroique
  // arbre-medecin
  'doctor-surgeon-1': 'arbre-medecin/l1c1', // Surgeon → chirurgien
  'doctor-bacta-specialist-1': 'arbre-medecin/l1c2', // Bacta Specialist → specialiste-du-bacta
  'doctor-grit-1': 'arbre-medecin/l1c3', // Grit → cran
  'doctor-resolve-1': 'arbre-medecin/l1c4', // Resolve → resolution
  'doctor-stim-application': 'arbre-medecin/l2c1', // Stim Application → injection-de-stimulant
  'doctor-grit-2': 'arbre-medecin/l2c2', // Grit → cran
  'doctor-surgeon-2': 'arbre-medecin/l2c3', // Surgeon → chirurgien
  'doctor-resolve-2': 'arbre-medecin/l2c4', // Resolve → resolution
  'doctor-surgeon-3': 'arbre-medecin/l3c1', // Surgeon → chirurgien
  'doctor-grit-3': 'arbre-medecin/l3c2', // Grit → cran
  'doctor-bacta-specialist-2': 'arbre-medecin/l3c3', // Bacta Specialist → specialiste-du-bacta
  'doctor-pressure-point': 'arbre-medecin/l3c4', // Pressure Point → point-de-pression
  'doctor-improved-stim-application': 'arbre-medecin/l4c1', // Improved Stim Application → injection-de-stimulant-amelioree
  'doctor-natural-doctor': 'arbre-medecin/l4c2', // Natural Doctor → medecin-ne
  'doctor-toughened-1': 'arbre-medecin/l4c3', // Toughened → endurci
  'doctor-anatomy-lessons': 'arbre-medecin/l4c4', // Anatomy Lessons → lecons-d-anatomie
  'doctor-supreme-stim-application': 'arbre-medecin/l5c1', // Supreme Stim Application → injection-de-stimulant-supreme
  'doctor-master-doctor': 'arbre-medecin/l5c2', // Master Doctor → maitre-medecin
  'doctor-dedication': 'arbre-medecin/l5c3', // Dedication → devouement
  'doctor-dodge': 'arbre-medecin/l5c4', // Dodge → esquive
  // arbre-politicien
  'politico-kill-with-kindness-1': 'arbre-politicien/l1c1', // Kill with Kindness → tuer-par-la-gentillesse
  'politico-grit-1': 'arbre-politicien/l1c2', // Grit → cran
  'politico-plausible-deniability-1': 'arbre-politicien/l1c3', // Plausible Deniability → deni-plausible
  'politico-toughened-1': 'arbre-politicien/l1c4', // Toughened → endurci
  'politico-inspiring-rhetoric': 'arbre-politicien/l2c1', // Inspiring Rhetoric → rhetorique-inspirante
  'politico-kill-with-kindness-2': 'arbre-politicien/l2c2', // Kill with Kindness → tuer-par-la-gentillesse
  'politico-scathing-tirade': 'arbre-politicien/l2c3', // Scathing Tirade → tirade-cinglante
  'politico-plausible-deniability-2': 'arbre-politicien/l2c4', // Plausible Deniability → deni-plausible
  'politico-dodge': 'arbre-politicien/l3c1', // Dodge → esquive
  'politico-improved-inspiring-rhetoric': 'arbre-politicien/l3c2', // Improved Inspiring Rhetoric → rhetorique-inspirante-amelioree
  'politico-improved-scathing-tirade': 'arbre-politicien/l3c3', // Improved Scathing Tirade → tirade-cinglante-amelioree
  'politico-well-rounded': 'arbre-politicien/l3c4', // Well Rounded → polyvalent
  'politico-grit-2': 'arbre-politicien/l4c1', // Grit → cran
  'politico-supreme-inspiring-rhetoric': 'arbre-politicien/l4c2', // Supreme Inspiring Rhetoric → rhetorique-inspirante-supreme
  'politico-supreme-scathing-tirade': 'arbre-politicien/l4c3', // Supreme Scathing Tirade → tirade-cinglante-supreme
  'politico-nobodys-fool': 'arbre-politicien/l4c4', // Nobody's Fool → pas-ne-d-hier
  'politico-steely-nerves': 'arbre-politicien/l5c1', // Steely Nerves → nerfs-d-acier
  'politico-dedication': 'arbre-politicien/l5c2', // Dedication → devouement
  'politico-natural-charmer': 'arbre-politicien/l5c3', // Natural Charmer → charmeur-ne
  'politico-intense-presence': 'arbre-politicien/l5c4', // Intense Presence → presence-intense
  // arbre-erudit
  'scholar-respected-scholar-1': 'arbre-erudit/l1c1', // Respected Scholar → erudit-respecte
  'scholar-speaks-binary': 'arbre-erudit/l1c2', // Speaks Binary → parle-le-binaire
  'scholar-grit-1': 'arbre-erudit/l1c3', // Grit → cran
  'scholar-brace': 'arbre-erudit/l1c4', // Brace → arc-boute
  'scholar-researcher-1': 'arbre-erudit/l2c1', // Researcher → chercheur
  'scholar-respected-scholar-2': 'arbre-erudit/l2c2', // Respected Scholar → erudit-respecte
  'scholar-resolve': 'arbre-erudit/l2c3', // Resolve → resolution
  'scholar-researcher-2': 'arbre-erudit/l2c4', // Researcher → chercheur
  'scholar-codebreaker': 'arbre-erudit/l3c1', // Codebreaker → casseur-de-codes
  'scholar-knowledge-specialization-1': 'arbre-erudit/l3c2', // Knowledge Specialization → specialisation-du-savoir
  'scholar-natural-scholar': 'arbre-erudit/l3c3', // Natural Scholar → erudit-ne
  'scholar-well-rounded': 'arbre-erudit/l3c4', // Well Rounded → polyvalent
  'scholar-knowledge-specialization-2': 'arbre-erudit/l4c1', // Knowledge Specialization → specialisation-du-savoir
  'scholar-intense-focus': 'arbre-erudit/l4c2', // Intense Focus → concentration-intense
  'scholar-confidence': 'arbre-erudit/l4c3', // Confidence → assurance
  'scholar-resolve-2': 'arbre-erudit/l4c4', // Resolve → resolution
  'scholar-stroke-of-genius': 'arbre-erudit/l5c1', // Stroke of Genius → coup-de-genie
  'scholar-mental-fortress': 'arbre-erudit/l5c2', // Mental Fortress → forteresse-mentale
  'scholar-dedication': 'arbre-erudit/l5c3', // Dedication → devouement
  'scholar-toughened': 'arbre-erudit/l5c4', // Toughened → endurci
  // arbre-vagabond
  'fringer-galaxy-mapper-1': 'arbre-vagabond/l1c1', // Galaxy Mapper → cartographe-galactique
  'fringer-street-smarts-1': 'arbre-vagabond/l1c2', // Street Smarts → debrouillard
  'fringer-rapid-recovery-1': 'arbre-vagabond/l1c3', // Rapid Recovery → recuperation-rapide
  'fringer-street-smarts-2': 'arbre-vagabond/l1c4', // Street Smarts → debrouillard
  'fringer-skilled-jockey': 'arbre-vagabond/l2c1', // Skilled Jockey → as-du-manche
  'fringer-galaxy-mapper-2': 'arbre-vagabond/l2c2', // Galaxy Mapper → cartographe-galactique
  'fringer-grit-1': 'arbre-vagabond/l2c3', // Grit → cran
  'fringer-toughened-1': 'arbre-vagabond/l2c4', // Toughened → endurci
  'fringer-master-starhopper': 'arbre-vagabond/l3c1', // Master Starhopper → maitre-astronavigateur
  'fringer-defensive-driving': 'arbre-vagabond/l3c2', // Defensive Driving → conduite-defensive
  'fringer-rapid-recovery-2': 'arbre-vagabond/l3c3', // Rapid Recovery → recuperation-rapide
  'fringer-durable': 'arbre-vagabond/l3c4', // Durable → resistant
  'fringer-rapid-recovery-3': 'arbre-vagabond/l4c1', // Rapid Recovery → recuperation-rapide
  'fringer-jump-up': 'arbre-vagabond/l4c2', // Jump Up → debout
  'fringer-grit-2': 'arbre-vagabond/l4c3', // Grit → cran
  'fringer-knockdown': 'arbre-vagabond/l4c4', // Knockdown → renverser
  'fringer-dedication': 'arbre-vagabond/l5c1', // Dedication → devouement
  'fringer-toughened-2': 'arbre-vagabond/l5c2', // Toughened → endurci
  'fringer-dodge-1': 'arbre-vagabond/l5c3', // Dodge → esquive
  'fringer-dodge-2': 'arbre-vagabond/l5c4', // Dodge → esquive
  // arbre-eclaireur
  'scout-rapid-recovery-1': 'arbre-eclaireur/l1c1', // Rapid Recovery → recuperation-rapide
  'scout-stalker-1': 'arbre-eclaireur/l1c2', // Stalker → traqueur
  'scout-grit-1': 'arbre-eclaireur/l1c3', // Grit → cran
  'scout-shortcut-1': 'arbre-eclaireur/l1c4', // Shortcut → raccourci
  'scout-forager': 'arbre-eclaireur/l2c1', // Forager → fourrageur
  'scout-quick-strike-1': 'arbre-eclaireur/l2c2', // Quick Strike → frappe-rapide
  'scout-lets-ride': 'arbre-eclaireur/l2c3', // Let's Ride → en-selle
  'scout-disorient-1': 'arbre-eclaireur/l2c4', // Disorient → desorientation
  'scout-rapid-recovery-2': 'arbre-eclaireur/l3c1', // Rapid Recovery → recuperation-rapide
  'scout-natural-hunter': 'arbre-eclaireur/l3c2', // Natural Hunter → chasseur-ne
  'scout-familiar-suns': 'arbre-eclaireur/l3c3', // Familiar Suns → soleils-familiers
  'scout-shortcut-2': 'arbre-eclaireur/l3c4', // Shortcut → raccourci
  'scout-grit-2': 'arbre-eclaireur/l4c1', // Grit → cran
  'scout-heightened-awareness': 'arbre-eclaireur/l4c2', // Heightened Awareness → vigilance-accrue
  'scout-toughened': 'arbre-eclaireur/l4c3', // Toughened → endurci
  'scout-quick-strike-2': 'arbre-eclaireur/l4c4', // Quick Strike → frappe-rapide
  'scout-utility-belt': 'arbre-eclaireur/l5c1', // Utility Belt → ceinture-utilitaire
  'scout-dedication': 'arbre-eclaireur/l5c2', // Dedication → devouement
  'scout-stalker-2': 'arbre-eclaireur/l5c3', // Stalker → traqueur
  'scout-disorient-2': 'arbre-eclaireur/l5c4', // Disorient → desorientation
  // arbre-marchand
  'trader-know-somebody-1': 'arbre-marchand/l1c1', // Know Somebody → connaitre-quelqu-un
  'trader-convincing-demeanor': 'arbre-marchand/l1c2', // Convincing Demeanor → attitude-convaincante
  'trader-wheel-and-deal-1': 'arbre-marchand/l1c3', // Wheel and Deal → marchandage
  'trader-smooth-talker-1': 'arbre-marchand/l1c4', // Smooth Talker → beau-parleur
  'trader-wheel-and-deal-2': 'arbre-marchand/l2c1', // Wheel and Deal → marchandage
  'trader-grit': 'arbre-marchand/l2c2', // Grit → cran
  'trader-spare-clip': 'arbre-marchand/l2c3', // Spare Clip → chargeur-de-rechange
  'trader-toughened': 'arbre-marchand/l2c4', // Toughened → endurci
  'trader-know-somebody-2': 'arbre-marchand/l3c1', // Know Somebody → connaitre-quelqu-un
  'trader-nobodys-fool-1': 'arbre-marchand/l3c2', // Nobody's Fool → pas-ne-d-hier
  'trader-smooth-talker-2': 'arbre-marchand/l3c3', // Smooth Talker → beau-parleur
  'trader-nobodys-fool-2': 'arbre-marchand/l3c4', // Nobody's Fool → pas-ne-d-hier
  'trader-wheel-and-deal-3': 'arbre-marchand/l4c1', // Wheel and Deal → marchandage
  'trader-steely-nerves': 'arbre-marchand/l4c2', // Steely Nerves → nerfs-d-acier
  'trader-black-market-contacts-1': 'arbre-marchand/l4c3', // Black Market Contacts → contacts-au-marche-noir
  'trader-black-market-contacts-2': 'arbre-marchand/l4c4', // Black Market Contacts → contacts-au-marche-noir
  'trader-know-somebody-3': 'arbre-marchand/l5c1', // Know Somebody → connaitre-quelqu-un
  'trader-natural-negotiator': 'arbre-marchand/l5c2', // Natural Negotiator → negociateur-ne
  'trader-dedication': 'arbre-marchand/l5c3', // Dedication → devouement
  'trader-master-merchant': 'arbre-marchand/l5c4', // Master Merchant → maitre-marchand
  // arbre-garde-du-corps
  'bodyguard-toughened-1': 'arbre-garde-du-corps/l1c1', // Toughened → endurci
  'bodyguard-barrage-1': 'arbre-garde-du-corps/l1c2', // Barrage → barrage
  'bodyguard-durable': 'arbre-garde-du-corps/l1c3', // Durable → resistant
  'bodyguard-grit': 'arbre-garde-du-corps/l1c4', // Grit → cran
  'bodyguard-body-guard-1': 'arbre-garde-du-corps/l2c1', // Body Guard → protecteur
  'bodyguard-hard-headed-1': 'arbre-garde-du-corps/l2c2', // Hard Headed → tete-dure
  'bodyguard-barrage-2': 'arbre-garde-du-corps/l2c3', // Barrage → barrage
  'bodyguard-brace-1': 'arbre-garde-du-corps/l2c4', // Brace → arc-boute
  'bodyguard-body-guard-2': 'arbre-garde-du-corps/l3c1', // Body Guard → protecteur
  'bodyguard-side-step-1': 'arbre-garde-du-corps/l3c2', // Side Step → pas-de-cote
  'bodyguard-defensive-stance-1': 'arbre-garde-du-corps/l3c3', // Defensive Stance → posture-defensive
  'bodyguard-brace-2': 'arbre-garde-du-corps/l3c4', // Brace → arc-boute
  'bodyguard-enduring': 'arbre-garde-du-corps/l4c1', // Enduring → endurant
  'bodyguard-side-step-2': 'arbre-garde-du-corps/l4c2', // Side Step → pas-de-cote
  'bodyguard-defensive-stance-2': 'arbre-garde-du-corps/l4c3', // Defensive Stance → posture-defensive
  'bodyguard-hard-headed-2': 'arbre-garde-du-corps/l4c4', // Hard Headed → tete-dure
  'bodyguard-dedication': 'arbre-garde-du-corps/l5c1', // Dedication → devouement
  'bodyguard-barrage-3': 'arbre-garde-du-corps/l5c2', // Barrage → barrage
  'bodyguard-toughened-2': 'arbre-garde-du-corps/l5c3', // Toughened → endurci
  'bodyguard-improved-hard-headed': 'arbre-garde-du-corps/l5c4', // Improved Hard Headed → tete-dure-amelioree
  // arbre-maraudeur
  'marauder-toughened-1': 'arbre-maraudeur/l1c1', // Toughened → endurci
  'marauder-frenzied-attack-1': 'arbre-maraudeur/l1c2', // Frenzied Attack → attaque-frenetique
  'marauder-feral-strength-1': 'arbre-maraudeur/l1c3', // Feral Strength → force-sauvage
  'marauder-lethal-blows-1': 'arbre-maraudeur/l1c4', // Lethal Blows → coups-mortels
  'marauder-feral-strength-2': 'arbre-maraudeur/l2c1', // Feral Strength → force-sauvage
  'marauder-toughened-2': 'arbre-maraudeur/l2c2', // Toughened → endurci
  'marauder-heroic-fortitude': 'arbre-maraudeur/l2c3', // Heroic Fortitude → courage-heroique
  'marauder-knockdown': 'arbre-maraudeur/l2c4', // Knockdown → renverser
  'marauder-enduring-1': 'arbre-maraudeur/l3c1', // Enduring → endurant
  'marauder-lethal-blows-2': 'arbre-maraudeur/l3c2', // Lethal Blows → coups-mortels
  'marauder-toughened-3': 'arbre-maraudeur/l3c3', // Toughened → endurci
  'marauder-frenzied-attack-2': 'arbre-maraudeur/l3c4', // Frenzied Attack → attaque-frenetique
  'marauder-toughened-4': 'arbre-maraudeur/l4c1', // Toughened → endurci
  'marauder-feral-strength-3': 'arbre-maraudeur/l4c2', // Feral Strength → force-sauvage
  'marauder-natural-brawler': 'arbre-maraudeur/l4c3', // Natural Brawler → bagarreur-ne
  'marauder-lethal-blows-3': 'arbre-maraudeur/l4c4', // Lethal Blows → coups-mortels
  'marauder-frenzied-attack-3': 'arbre-maraudeur/l5c1', // Frenzied Attack → attaque-frenetique
  'marauder-enduring-2': 'arbre-maraudeur/l5c2', // Enduring → endurant
  'marauder-defensive-stance': 'arbre-maraudeur/l5c3', // Defensive Stance → posture-defensive
  'marauder-dedication': 'arbre-maraudeur/l5c4', // Dedication → devouement
  // arbre-soldat-mercenaire
  'merc-command-1': 'arbre-soldat-mercenaire/l1c1', // Command → autorite
  'merc-second-wind-1': 'arbre-soldat-mercenaire/l1c2', // Second Wind → second-souffle
  'merc-point-blank-1': 'arbre-soldat-mercenaire/l1c3', // Point Blank → bout-portant
  'merc-side-step': 'arbre-soldat-mercenaire/l1c4', // Side Step → pas-de-cote
  'merc-second-wind-2': 'arbre-soldat-mercenaire/l2c1', // Second Wind → second-souffle
  'merc-confidence': 'arbre-soldat-mercenaire/l2c2', // Confidence → assurance
  'merc-strong-arm': 'arbre-soldat-mercenaire/l2c3', // Strong Arm → bras-puissant
  'merc-point-blank-2': 'arbre-soldat-mercenaire/l2c4', // Point Blank → bout-portant
  'merc-field-commander-1': 'arbre-soldat-mercenaire/l3c1', // Field Commander → commandant-de-terrain
  'merc-command-2': 'arbre-soldat-mercenaire/l3c2', // Command → autorite
  'merc-natural-marksman': 'arbre-soldat-mercenaire/l3c3', // Natural Marksman → tireur-ne
  'merc-sniper-shot': 'arbre-soldat-mercenaire/l3c4', // Sniper Shot → tir-de-precision
  'merc-improved-field-commander': 'arbre-soldat-mercenaire/l4c1', // Improved Field Commander → commandant-de-terrain-ameliore
  'merc-grit': 'arbre-soldat-mercenaire/l4c2', // Grit → cran
  'merc-toughened': 'arbre-soldat-mercenaire/l4c3', // Toughened → endurci
  'merc-lethal-blows': 'arbre-soldat-mercenaire/l4c4', // Lethal Blows → coups-mortels
  'merc-deadly-accuracy': 'arbre-soldat-mercenaire/l5c1', // Deadly Accuracy → precision-mortelle
  'merc-true-aim-1': 'arbre-soldat-mercenaire/l5c2', // True Aim → visee-parfaite
  'merc-dedication': 'arbre-soldat-mercenaire/l5c3', // Dedication → devouement
  'merc-true-aim-2': 'arbre-soldat-mercenaire/l5c4', // True Aim → visee-parfaite
  // arbre-pilote
  'pilot-full-throttle-1': 'arbre-pilote/l1c1', // Full Throttle → plein-gaz
  'pilot-skilled-jockey-1': 'arbre-pilote/l1c2', // Skilled Jockey → as-du-manche
  'pilot-galaxy-mapper-1': 'arbre-pilote/l1c3', // Galaxy Mapper → cartographe-galactique
  'pilot-lets-ride': 'arbre-pilote/l1c4', // Let's Ride → en-selle
  'pilot-skilled-jockey-2': 'arbre-pilote/l2c1', // Skilled Jockey → as-du-manche
  'pilot-dead-to-rights-1': 'arbre-pilote/l2c2', // Dead to Rights → en-plein-dans-le-mille
  'pilot-galaxy-mapper-2': 'arbre-pilote/l2c3', // Galaxy Mapper → cartographe-galactique
  'pilot-rapid-recovery': 'arbre-pilote/l2c4', // Rapid Recovery → recuperation-rapide
  'pilot-improved-full-throttle': 'arbre-pilote/l3c1', // Improved Full Throttle → plein-gaz-ameliore
  'pilot-improved-dead-to-rights': 'arbre-pilote/l3c2', // Improved Dead to Rights → en-plein-dans-le-mille-ameliore
  'pilot-grit': 'arbre-pilote/l3c3', // Grit → cran
  'pilot-natural-pilot': 'arbre-pilote/l3c4', // Natural Pilot → pilote-ne
  'pilot-grit-2': 'arbre-pilote/l4c1', // Grit → cran
  'pilot-supreme-full-throttle': 'arbre-pilote/l4c2', // Supreme Full Throttle → plein-gaz-supreme
  'pilot-tricky-target': 'arbre-pilote/l4c3', // Tricky Target → cible-insaisissable
  'pilot-defensive-driving': 'arbre-pilote/l4c4', // Defensive Driving → conduite-defensive
  'pilot-master-pilot': 'arbre-pilote/l5c1', // Master Pilot → maitre-pilote
  'pilot-dedication': 'arbre-pilote/l5c2', // Dedication → devouement
  'pilot-toughened': 'arbre-pilote/l5c3', // Toughened → endurci
  'pilot-brilliant-evasion': 'arbre-pilote/l5c4', // Brilliant Evasion → evasion-brillante
  // arbre-canaille
  'scoundrel-black-market-contacts-1': 'arbre-canaille/l1c1', // Black Market Contacts → contacts-au-marche-noir
  'scoundrel-convincing-demeanor-1': 'arbre-canaille/l1c2', // Convincing Demeanor → attitude-convaincante
  'scoundrel-quick-draw': 'arbre-canaille/l1c3', // Quick Draw → degainer-rapide
  'scoundrel-rapid-reaction-1': 'arbre-canaille/l1c4', // Rapid Reaction → reaction-rapide
  'scoundrel-convincing-demeanor-2': 'arbre-canaille/l2c1', // Convincing Demeanor → attitude-convaincante
  'scoundrel-black-market-contacts-2': 'arbre-canaille/l2c2', // Black Market Contacts → contacts-au-marche-noir
  'scoundrel-convincing-demeanor-3': 'arbre-canaille/l2c3', // Convincing Demeanor → attitude-convaincante
  'scoundrel-quick-strike-1': 'arbre-canaille/l2c4', // Quick Strike → frappe-rapide
  'scoundrel-hidden-storage-1': 'arbre-canaille/l3c1', // Hidden Storage → cache-secrete
  'scoundrel-toughened-1': 'arbre-canaille/l3c2', // Toughened → endurci
  'scoundrel-black-market-contacts-3': 'arbre-canaille/l3c3', // Black Market Contacts → contacts-au-marche-noir
  'scoundrel-side-step-1': 'arbre-canaille/l3c4', // Side Step → pas-de-cote
  'scoundrel-toughened-2': 'arbre-canaille/l4c1', // Toughened → endurci
  'scoundrel-rapid-reaction-2': 'arbre-canaille/l4c2', // Rapid Reaction → reaction-rapide
  'scoundrel-hidden-storage-2': 'arbre-canaille/l4c3', // Hidden Storage → cache-secrete
  'scoundrel-side-step-2': 'arbre-canaille/l4c4', // Side Step → pas-de-cote
  'scoundrel-dedication': 'arbre-canaille/l5c1', // Dedication → devouement
  'scoundrel-natural-charmer': 'arbre-canaille/l5c2', // Natural Charmer → charmeur-ne
  'scoundrel-soft-spot': 'arbre-canaille/l5c3', // Soft Spot → point-faible
  'scoundrel-quick-strike-2': 'arbre-canaille/l5c4', // Quick Strike → frappe-rapide
  // arbre-voleur
  'thief-street-smarts-1': 'arbre-voleur/l1c1', // Street Smarts → debrouillard
  'thief-black-market-contacts-1': 'arbre-voleur/l1c2', // Black Market Contacts → contacts-au-marche-noir
  'thief-indistinguishable-1': 'arbre-voleur/l1c3', // Indistinguishable → anonyme
  'thief-bypass-security-1': 'arbre-voleur/l1c4', // Bypass Security → contournement-de-securite
  'thief-black-market-contacts-2': 'arbre-voleur/l2c1', // Black Market Contacts → contacts-au-marche-noir
  'thief-dodge-1': 'arbre-voleur/l2c2', // Dodge → esquive
  'thief-grit-1': 'arbre-voleur/l2c3', // Grit → cran
  'thief-hidden-storage-1': 'arbre-voleur/l2c4', // Hidden Storage → cache-secrete
  'thief-stalker': 'arbre-voleur/l3c1', // Stalker → traqueur
  'thief-grit-2': 'arbre-voleur/l3c2', // Grit → cran
  'thief-rapid-reaction': 'arbre-voleur/l3c3', // Rapid Reaction → reaction-rapide
  'thief-shortcut': 'arbre-voleur/l3c4', // Shortcut → raccourci
  'thief-bypass-security-2': 'arbre-voleur/l4c1', // Bypass Security → contournement-de-securite
  'thief-natural-rogue': 'arbre-voleur/l4c2', // Natural Rogue → filou-ne
  'thief-street-smarts-2': 'arbre-voleur/l4c3', // Street Smarts → debrouillard
  'thief-jump-up': 'arbre-voleur/l4c4', // Jump Up → debout
  'thief-master-of-shadows': 'arbre-voleur/l5c1', // Master of Shadows → maitre-des-ombres
  'thief-dodge-2': 'arbre-voleur/l5c2', // Dodge → esquive
  'thief-indistinguishable-2': 'arbre-voleur/l5c3', // Indistinguishable → anonyme
  'thief-dedication': 'arbre-voleur/l5c4', // Dedication → devouement
  // arbre-mecanicien
  'mechanic-gearhead-1': 'arbre-mecanicien/l1c1', // Gearhead → fondu-de-mecanique
  'mechanic-toughened-1': 'arbre-mecanicien/l1c2', // Toughened → endurci
  'mechanic-fine-tuning-1': 'arbre-mecanicien/l1c3', // Fine Tuning → reglage-fin
  'mechanic-solid-repairs-1': 'arbre-mecanicien/l1c4', // Solid Repairs → reparations-solides
  'mechanic-redundant-systems': 'arbre-mecanicien/l2c1', // Redundant Systems → systemes-redondants
  'mechanic-solid-repairs-2': 'arbre-mecanicien/l2c2', // Solid Repairs → reparations-solides
  'mechanic-gearhead-2': 'arbre-mecanicien/l2c3', // Gearhead → fondu-de-mecanique
  'mechanic-grit-1': 'arbre-mecanicien/l2c4', // Grit → cran
  'mechanic-solid-repairs-3': 'arbre-mecanicien/l3c1', // Solid Repairs → reparations-solides
  'mechanic-enduring': 'arbre-mecanicien/l3c2', // Enduring → endurant
  'mechanic-bad-motivator': 'arbre-mecanicien/l3c3', // Bad Motivator → mauvais-moteur
  'mechanic-toughened-2': 'arbre-mecanicien/l3c4', // Toughened → endurci
  'mechanic-contraption': 'arbre-mecanicien/l4c1', // Contraption → systeme-d
  'mechanic-solid-repairs-4': 'arbre-mecanicien/l4c2', // Solid Repairs → reparations-solides
  'mechanic-fine-tuning-2': 'arbre-mecanicien/l4c3', // Fine Tuning → reglage-fin
  'mechanic-hard-headed': 'arbre-mecanicien/l4c4', // Hard Headed → tete-dure
  'mechanic-natural-tinkerer': 'arbre-mecanicien/l5c1', // Natural Tinkerer → bidouilleur-ne
  'mechanic-hold-together': 'arbre-mecanicien/l5c2', // Hold Together → tenir-le-coup
  'mechanic-dedication': 'arbre-mecanicien/l5c3', // Dedication → devouement
  'mechanic-improved-hard-headed': 'arbre-mecanicien/l5c4', // Improved Hard Headed → tete-dure-amelioree
  // arbre-technicien-hors-la-loi
  'outlaw-tinkerer-1': 'arbre-technicien-hors-la-loi/l1c1', // Tinkerer → bidouilleur
  'outlaw-utinni-1': 'arbre-technicien-hors-la-loi/l1c2', // Utinni! → utinni
  'outlaw-speaks-binary-1': 'arbre-technicien-hors-la-loi/l1c3', // Speaks Binary → parle-le-binaire
  'outlaw-tinkerer-2': 'arbre-technicien-hors-la-loi/l1c4', // Tinkerer → bidouilleur
  'outlaw-solid-repairs': 'arbre-technicien-hors-la-loi/l2c1', // Solid Repairs → reparations-solides
  'outlaw-grit-1': 'arbre-technicien-hors-la-loi/l2c2', // Grit → cran
  'outlaw-utinni-2': 'arbre-technicien-hors-la-loi/l2c3', // Utinni! → utinni
  'outlaw-toughened-1': 'arbre-technicien-hors-la-loi/l2c4', // Toughened → endurci
  'outlaw-utility-belt': 'arbre-technicien-hors-la-loi/l3c1', // Utility Belt → ceinture-utilitaire
  'outlaw-side-step': 'arbre-technicien-hors-la-loi/l3c2', // Side Step → pas-de-cote
  'outlaw-brace-1': 'arbre-technicien-hors-la-loi/l3c3', // Brace → arc-boute
  'outlaw-defensive-stance-1': 'arbre-technicien-hors-la-loi/l3c4', // Defensive Stance → posture-defensive
  'outlaw-jury-rigged-1': 'arbre-technicien-hors-la-loi/l4c1', // Jury Rigged → rafistolage
  'outlaw-speaks-binary-2': 'arbre-technicien-hors-la-loi/l4c2', // Speaks Binary → parle-le-binaire
  'outlaw-inventor-1': 'arbre-technicien-hors-la-loi/l4c3', // Inventor → inventeur
  'outlaw-jury-rigged-2': 'arbre-technicien-hors-la-loi/l4c4', // Jury Rigged → rafistolage
  'outlaw-inventor-2': 'arbre-technicien-hors-la-loi/l5c1', // Inventor → inventeur
  'outlaw-dedication': 'arbre-technicien-hors-la-loi/l5c2', // Dedication → devouement
  'outlaw-known-schematic': 'arbre-technicien-hors-la-loi/l5c3', // Known Schematic → plans-connus
  'outlaw-brace-2': 'arbre-technicien-hors-la-loi/l5c4', // Brace → arc-boute
  // arbre-pirate-informatique
  'slicer-codebreaker-1': 'arbre-pirate-informatique/l1c1', // Codebreaker → casseur-de-codes
  'slicer-grit-1': 'arbre-pirate-informatique/l1c2', // Grit → cran
  'slicer-technical-aptitude-1': 'arbre-pirate-informatique/l1c3', // Technical Aptitude → aptitude-technique
  'slicer-bypass-security-1': 'arbre-pirate-informatique/l1c4', // Bypass Security → contournement-de-securite
  'slicer-defensive-slicing-1': 'arbre-pirate-informatique/l2c1', // Defensive Slicing → piratage-defensif
  'slicer-technical-aptitude-2': 'arbre-pirate-informatique/l2c2', // Technical Aptitude → aptitude-technique
  'slicer-grit-2': 'arbre-pirate-informatique/l2c3', // Grit → cran
  'slicer-bypass-security-2': 'arbre-pirate-informatique/l2c4', // Bypass Security → contournement-de-securite
  'slicer-natural-programmer': 'arbre-pirate-informatique/l3c1', // Natural Programmer → programmeur-ne
  'slicer-bypass-security-3': 'arbre-pirate-informatique/l3c2', // Bypass Security → contournement-de-securite
  'slicer-defensive-slicing-2': 'arbre-pirate-informatique/l3c3', // Defensive Slicing → piratage-defensif
  'slicer-grit-3': 'arbre-pirate-informatique/l3c4', // Grit → cran
  'slicer-defensive-slicing-3': 'arbre-pirate-informatique/l4c1', // Defensive Slicing → piratage-defensif
  'slicer-improved-defensive-slicing': 'arbre-pirate-informatique/l4c2', // Improved Defensive Slicing → piratage-defensif-ameliore
  'slicer-codebreaker-2': 'arbre-pirate-informatique/l4c3', // Codebreaker → casseur-de-codes
  'slicer-resolve': 'arbre-pirate-informatique/l4c4', // Resolve → resolution
  'slicer-skilled-slicer': 'arbre-pirate-informatique/l5c1', // Skilled Slicer → pirate-habile
  'slicer-master-slicer': 'arbre-pirate-informatique/l5c2', // Master Slicer → maitre-pirate
  'slicer-mental-fortress': 'arbre-pirate-informatique/l5c3', // Mental Fortress → forteresse-mentale
  'slicer-dedication': 'arbre-pirate-informatique/l5c4', // Dedication → devouement
};
