/**
 * Curseurs des autres : une couleur stable par personne, un texte lisible sur sa couleur, un
 * nom raccourci, et des curseurs créés une fois puis libérés quand ils disparaissent.
 */
import { describe, expect, it } from 'vitest';
import { CURSOR_COLORS, CursorLayer, cursorColor, shorten, textOn } from './cursors';

class Node {
  children: Node[] = [];
  position = { x: 0, y: 0, set: (x: number, y: number) => Object.assign(this.position, { x, y }) };
  scale = { x: 1, set: (v: number) => Object.assign(this.scale, { x: v }) };
  destroyed = false;
  text = '';
  width = 40;
  height = 14;
  constructor(o?: { text?: string }) {
    this.text = o?.text ?? '';
  }
  addChild(...c: Node[]) {
    this.children.push(...c);
  }
  poly() {
    return this;
  }
  roundRect() {
    return this;
  }
  fill() {
    return this;
  }
  stroke() {
    return this;
  }
  clear() {
    return this;
  }
  removeFromParent() {}
  removeChildren() {
    return this.children.splice(0);
  }
  destroy() {
    this.destroyed = true;
  }
}

const pixi = { Container: Node, Graphics: Node, Text: Node };

describe('curseurs des autres', () => {
  it('une couleur stable par personne, prise dans la palette', () => {
    expect(cursorColor('alice')).toBe(cursorColor('alice'));
    expect(CURSOR_COLORS).toContain(cursorColor('bob'));
    const many = new Set(Array.from({ length: 40 }, (_, i) => cursorColor(`u${i}`)));
    expect(many.size).toBeGreaterThan(4);
  });

  it('texte lisible : sombre sur l’ambre, blanc sur le bleu', () => {
    expect(textOn(0xeab308)).toBe(0x18181b);
    expect(textOn(0x3b82f6)).toBe(0xffffff);
  });

  it('nom raccourci au-delà de 22 caractères, « Joueur » s’il est vide', () => {
    expect(shorten('Gaël')).toBe('Gaël');
    expect(shorten('   ')).toBe('Joueur');
    expect(shorten('a'.repeat(30))).toHaveLength(22);
  });

  it('créé une fois, suit la position et le zoom, libéré quand il disparaît', () => {
    const plane = new Node();
    const layer = new CursorLayer(pixi as never, plane as never);
    const name = () => 'Gaël';
    layer.sync([{ userId: 'g', x: 10, y: 20 }], 2, name);
    expect(plane.children).toHaveLength(1);
    const root = plane.children[0]!;
    layer.sync([{ userId: 'g', x: 30, y: 40 }], 4, name);
    expect(plane.children).toHaveLength(1);
    expect(root.position).toMatchObject({ x: 30, y: 40 });
    expect(root.scale.x).toBe(0.25);
    const parts = [...root.children];
    layer.sync([], 4, name);
    expect(root.destroyed).toBe(true);
    expect(parts.every((p) => p.destroyed)).toBe(true);
  });
});
