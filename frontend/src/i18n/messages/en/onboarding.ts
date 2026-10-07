import type fr from '../fr/onboarding';
import type { Translation } from '../../types';

export default {
  steps: {
    bienvenue: 'Welcome',
    profil: 'Your profile',
    depart: 'First steps',
  },
  skip: 'Skip',
  welcome: 'Welcome to Yner',
  hello: 'Hi, <b>{name}</b>.',
  lead: 'Four questions to set up your table: who you are, how you play, and your favorite worlds. Less than a minute.',
  start: 'Start',
  nameQuestion: 'What should the table call you?',
  nameHint: 'This is what your fellow adventurers will see. You can change everything later.',
  pickAvatar: 'Pick an avatar',
  avatarFormats: 'PNG, JPEG, WebP, 5 MB max.',
  aboutYou: 'A few words about you',
  optional: 'Optional',
  bioPlaceholder: 'Role-player since high school, fan of damp dungeons and chatty NPCs…',
  whereStart: 'Where does the adventure begin?',
  whereStartHint:
    'Join your GM’s table, an open campaign, or start your own. Your hero is then created in the campaign, with its game system.',
  joinCampaign: 'Join a campaign',
  campaignCode: 'Campaign code',
  openCampaigns: 'Open campaigns',
  openCampaignsHint: 'No code? These public tables welcome new players.',
  createCampaign: 'Create a campaign',
  createCampaignHint: 'You’re the GM: pick the system and the mood, then invite your players.',
  explore: 'Explore on my own',
} satisfies Translation<typeof fr>;
