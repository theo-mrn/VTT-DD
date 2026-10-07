import type fr from '../../fr/map';
import type { Translation } from '../../../types';
import actions from './actions';
import bubbles from './bubbles';
import combat from './combat';
import common from './common';
import display from './display';
import fullscreen from './fullscreen';
import grid from './grid';
import history from './history';
import layers from './layers';
import party from './party';
import presence from './presence';
import scene from './scene';
import snap from './snap';
import tokens from './tokens';
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
  grid,
  history,
  layers,
  party,
  presence,
  scene,
  snap,
  tokens,
  tools,
  vision,
  weather,
} satisfies Translation<typeof fr>;
