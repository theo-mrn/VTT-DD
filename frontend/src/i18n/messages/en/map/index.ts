import type fr from '../../fr/map';
import type { Translation } from '../../../types';
import actions from './actions';
import bubbles from './bubbles';
import combat from './combat';
import common from './common';
import display from './display';
import drawings from './drawings';
import fog from './fog';
import fullscreen from './fullscreen';
import grid from './grid';
import history from './history';
import layers from './layers';
import lights from './lights';
import measurements from './measurements';
import objects from './objects';
import obstacles from './obstacles';
import party from './party';
import portals from './portals';
import presence from './presence';
import scene from './scene';
import scenes from './scenes';
import snap from './snap';
import sounds from './sounds';
import tokens from './tokens';
import toolbar from './toolbar';
import tools from './tools';
import ui from './ui';
import vision from './vision';
import weather from './weather';

export default {
  actions,
  bubbles,
  combat,
  common,
  display,
  drawings,
  fog,
  fullscreen,
  grid,
  history,
  layers,
  lights,
  measurements,
  objects,
  obstacles,
  party,
  portals,
  presence,
  scene,
  scenes,
  snap,
  sounds,
  tokens,
  toolbar,
  tools,
  ui,
  vision,
  weather,
} satisfies Translation<typeof fr>;
