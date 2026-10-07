import type fr from '../fr/errors';
import type { Translation } from '../../types';

export default {
  unreachable: 'The server cannot be reached, please try again in a moment.',
  generic: 'Something went wrong.',
  api: {
    version_conflict: 'This was changed in the meantime: reload and try again.',
    campaign_not_found: 'Campaign not found.',
    character_not_found: 'Character not found.',
    note_not_found: 'Note not found.',
    not_found: 'Not found.',
    storage_quota_exceeded: 'Your storage space is full.',
    storage_unavailable: 'File uploads are not available right now.',
    too_many_rolls: 'Too many rolls in a short time: please wait a moment.',
    too_many_messages: 'Too many messages in a short time: please wait a moment.',
    email_taken: 'An account already exists with this email.',
    invalid_password: 'Incorrect password.',
    invalid_notation: 'Invalid dice formula.',
    banned: 'You have been banned from this campaign.',
    user_banned: 'This player is banned from this campaign.',
    not_their_turn: 'It is not their turn.',
    invalid_image: 'Image rejected.',
    invalid_image_url: 'Image rejected.',
    validation_failed: 'Invalid data.',
  },
  status: {
    badRequest: 'Invalid request.',
    unauthorized: 'Your session has expired: please sign in again.',
    forbidden: 'Access denied.',
    notFound: 'Not found.',
    conflict: 'Conflict: reload and try again.',
    tooLarge: 'File too large.',
    tooMany: 'Too many requests: please wait a moment.',
    server: 'Server error, please try again in a moment.',
  },
} satisfies Translation<typeof fr>;
