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
    name: 'room',
    description: 'Choisir la salle que suivent tes jets',
    options: [
      {
        type: STRING,
        name: 'campaign',
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
        name: 'dice',
        description: 'Dés du système, ex. 1d20+CON',
        // Obligatoire : Discord y met alors le texte tapé après /roll (facultative, il l'ignore)
        required: true,
        autocomplete: true,
        max_length: 200,
      },
      { type: BOOLEAN, name: 'hidden', description: 'Visible de toi et du MJ seulement' },
    ],
    ...contexts,
  },
  {
    name: 'tray',
    description: 'Plateau de dés du système de ta salle active',
    ...contexts,
  },
  {
    name: 'history',
    description: 'Derniers jets publics de ta salle active',
    options: [
      { type: STRING, name: 'player', description: 'Nom du joueur ou du personnage' },
      { type: INTEGER, name: 'count', description: 'Nombre de jets', min_value: 1, max_value: 20 },
    ],
    ...contexts,
  },
  {
    name: 'stats',
    description: 'Statistiques de ta salle active',
    options: [{ type: STRING, name: 'player', description: 'Nom du joueur ou du personnage' }],
    ...contexts,
  },
  { name: 'me', description: 'Ton compte Yner lié et ta salle active', ...contexts },
  { name: 'link', description: 'Lier ton compte Yner à Discord', ...contexts },
  { name: 'unlink', description: 'Délier ton compte Yner de Discord', ...contexts },
];
