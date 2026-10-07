import type fr from '../fr/meta';
import type { Translation } from '../../types';

export default {
  description: 'A VTT platform to create, run and play your epic tabletop adventures online.',
  landingTitle: 'Yner · Online tabletop roleplaying',
  landingDescription:
    'Living maps, fog of war, automated character sheets and 3D dice: the online tabletop for roleplaying games, free and with nothing to install.',
  titles: {
    notice: 'Legal notice',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    credits: 'Credits and licenses',
    resources: 'Resources',
    notes: 'Notes',
    newCampaign: 'New campaign',
    newCharacter: 'New character',
    welcome: 'Welcome',
  },
  descriptions: {
    notice: 'Publisher, host and contact details of the Yner website.',
    privacy: 'The data Yner processes, why, for how long, and your rights.',
    terms: 'The rules of Yner: account, content, reporting, liability.',
    credits: 'Game content, artwork, fonts and software used by Yner.',
  },
} satisfies Translation<typeof fr>;
