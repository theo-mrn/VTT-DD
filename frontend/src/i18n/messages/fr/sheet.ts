/** Fiche de personnage : valeurs, effets, explications, blocs. */
export default {
  effects: {
    prerequisite: 'Prérequis : {text}',
    rank: 'Rang {rank} : {name}',
    grants: 'Accorde : {name}',
    andOthers: '{names} et {count, plural, one {# autre} other {# autres}}',
    rolls: 'Modifie certains jets',
    conditional: '(sous condition)',
    atLeast: '{name} au moins {value}',
    atMost: '{name} au plus {value}',
    immunity: 'Immunité à certains dégâts',
    resistance: 'Résistance à certains dégâts',
    reduction: 'Réduction des dégâts {value}',
  },
  explain: {
    disabled: '{name} : {value} (désactivé)',
    base: 'Base : {value}',
    pair: '{name} : {value}',
  },
  formula: {
    pickCharacter: '{what} : choisissez un personnage pour utiliser ses valeurs',
    pickCharacterFor: '« {name} » : choisissez un personnage pour utiliser ses attributs',
    attribute: 'Attribut',
    modifier: 'Modificateur',
    empty: 'Formule vide',
    numberExpected: 'Nombre attendu',
    invalid: 'Formule invalide',
  },
  unavailable: 'Personnage indisponible',
  conflict: {
    title: 'Fiche modifiée entre-temps',
    detail:
      "Cette fiche vient d'être modifiée ailleurs (par le MJ ou dans un autre onglet) : elle a été rechargée. Refaites votre modification.",
  },
} as const;
