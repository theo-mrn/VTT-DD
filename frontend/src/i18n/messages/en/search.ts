import type fr from '../fr/search';
import type { Translation } from '../../types';

export default {
  title: 'Search',
  placeholder: 'Search a rule, an item, a creature…',
  navPlaceholder: 'Search a page, a campaign, a rule…',
  escape: 'Esc',
  tabs: 'Sections',
  goTo: 'Go to',
  all: 'All',
  rules: 'Rules · {system}',
  rulesUnavailable: 'Rules unavailable.',
  noResult: 'No results.',
  via: 'via {names}',
  placeHint: 'Click on the map to place {name}',
  place: 'Place on the map',
  bestiary: 'Bestiary',
  back: 'Back',
} satisfies Translation<typeof fr>;
