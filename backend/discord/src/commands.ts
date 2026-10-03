/**
 * Commandes du bot de dés (docs/discord.md). Les options sont les mêmes pour tous : ce qui
 * dépend du système de la salle active passe par l'autocomplétion et le plateau de dés.
 */
const STRING = 3;
const INTEGER = 4;
const BOOLEAN = 5;

/** Utilisables sur un serveur et en message privé avec le bot. */
const contexts = { contexts: [0, 1], integration_types: [0] };

export const COMMANDS = [
  {
    name: 'salle',
    description: 'Choisir la salle que suivent tes jets',
    options: [
      {
        type: STRING,
        name: 'campagne',
        description: 'Une de tes campagnes (vide : affiche la salle active)',
        autocomplete: true,
      },
    ],
    ...contexts,
  },
  {
    name: 'roll',
    description: 'Lancer des dés dans ta salle active',
    options: [
      {
        type: STRING,
        name: 'des',
        description: 'Dés du système (vide : plateau de dés)',
        autocomplete: true,
        max_length: 200,
      },
      { type: BOOLEAN, name: 'cache', description: 'Visible de toi et du MJ seulement' },
    ],
    ...contexts,
  },
  {
    name: 'history',
    description: 'Derniers jets publics de ta salle active',
    options: [
      { type: STRING, name: 'joueur', description: 'Nom du joueur ou du personnage' },
      { type: INTEGER, name: 'n', description: 'Nombre de jets', min_value: 1, max_value: 20 },
    ],
    ...contexts,
  },
  {
    name: 'stats',
    description: 'Statistiques de ta salle active',
    options: [{ type: STRING, name: 'joueur', description: 'Nom du joueur ou du personnage' }],
    ...contexts,
  },
  { name: 'link', description: 'Lier ton compte Yner à Discord', ...contexts },
  { name: 'unlink', description: 'Délier ton compte Yner de Discord', ...contexts },
];
