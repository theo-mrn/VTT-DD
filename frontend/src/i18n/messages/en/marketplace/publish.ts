/** Publish to the marketplace in one go: pick, check, send for review. */
import type fr from '../../fr/marketplace/publish';
import type { Translation } from '../../../types';

export default {
  action: 'Publish',
  kinds: { scene: 'Scene', character: 'Character' },
  noCharacter: 'No character in this campaign',
  chooseCampaign: 'Choose a campaign',
  back: 'Back',
  noCampaign: 'No campaign',
  noScene: 'No scene in this campaign',
  name: 'Title',
  summary: 'Summary',
  cover: 'Cover',
  changeCover: 'Change',
  noCover: 'Choose a cover image',
  attest: 'I own the rights to all of this content',
  submit: 'Publish',
  steps: {
    listing: 'Creating the listing',
    cover: 'Cover',
    content: 'Sending the content',
    review: 'Going live',
  },
  done: 'Published',
  mine: 'My publications',
} satisfies Translation<typeof fr>;
