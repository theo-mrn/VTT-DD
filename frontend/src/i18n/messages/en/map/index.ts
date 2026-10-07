import type fr from '../../fr/map';
import type { Translation } from '../../../types';
import actions from './actions';
import bubbles from './bubbles';
import combat from './combat';
import common from './common';
import display from './display';
import fullscreen from './fullscreen';
import history from './history';
import layers from './layers';
import party from './party';
import presence from './presence';
import scene from './scene';
import snap from './snap';
import tools from './tools';
import vision from './vision';
import weather from './weather';

export default {
  actions,
  bubbles,
  combat,
  common,
  display,
  fullscreen,
  history,
  layers,
  party,
  presence,
  scene,
  snap,
  tools,
  vision,
  weather,
} satisfies Translation<typeof fr>;
