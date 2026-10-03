/**
 * Destruction d'un sous-arbre Pixi : les dessins propres sont libérés, rien de partagé n'est
 * cassé (contexte d'une icône, texture d'une image).
 */
import { Container, Graphics, GraphicsContext, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { destroyDisplay } from './destroy-display';

describe('destroyDisplay', () => {
  it('libère les contextes propres des Graphics enfants, garde les contextes partagés', () => {
    const shared = new GraphicsContext().circle(0, 0, 5).fill(0xffffff);
    const root = new Container();
    const own = new Graphics().rect(0, 0, 10, 10).fill(0xffffff);
    const icon = new Container();
    const glyph = new Graphics(shared);
    const other = new Graphics(shared);
    icon.addChild(glyph);
    root.addChild(own, icon);
    const parent = new Container();
    parent.addChild(root);
    const ownContext = own.context;

    destroyDisplay(root);

    expect(root.destroyed && own.destroyed && icon.destroyed && glyph.destroyed).toBe(true);
    expect(parent.children).toHaveLength(0);
    // La géométrie propre part avec son Graphics…
    expect(ownContext.destroyed).toBe(true);
    // … celle d'une icône partagée reste utilisable par les autres
    expect(shared.destroyed).toBe(false);
    expect(other.context).toBe(shared);
  });

  it('garde la texture d’un Sprite (partagée par adresse)', () => {
    const texture = new Texture();
    const root = new Container();
    root.addChild(new Sprite(texture));
    destroyDisplay(root);
    expect(texture.destroyed).toBe(false);
  });

  it('`destroy({ children: true })` seul laisserait la géométrie propre (Pixi 8)', () => {
    const own = new Graphics().rect(0, 0, 10, 10).fill(0xffffff);
    const ctx = own.context;
    const root = new Container();
    root.addChild(own);
    root.destroy({ children: true });
    expect(ctx.destroyed).toBe(false);
    ctx.destroy();
  });
});
