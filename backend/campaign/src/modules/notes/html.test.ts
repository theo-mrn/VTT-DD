/**
 * Assainissement du HTML des notes : vecteurs d'injection connus, HTML de
 * l'éditeur (actuel et ancien) conservé, texte brut et forme de recherche.
 */
import { describe, expect, it } from 'vitest';
import { safeHref, sanitizeNoteHtml, searchForm, searchTerms } from './html.js';

const opts = { imageBase: 'http://localhost:8333/vtt' };
const clean = (html: string) => sanitizeNoteHtml(html, opts).html;

describe('assainissement du HTML des notes', () => {
  it('garde le HTML de l’éditeur tel quel', () => {
    const html =
      '<h1>Titre</h1><h2>Sous-titre</h2><p>Un <strong>gras</strong>, <em>italique</em>, ' +
      '<s>barré</s>, <u>souligné</u> et <code>code</code>.</p><ul><li><p>un</p></li></ul>' +
      '<ol start="3"><li><p>trois</p></li></ol><blockquote><p>citation</p></blockquote>' +
      '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre><hr><p>fin<br>ligne</p>';
    expect(clean(html)).toBe(html);
  });

  it('réécrit les liens avec target et rel, et garde leur adresse', () => {
    expect(clean('<p><a href="https://exemple.fr/a?b=1&amp;c=2">lien</a></p>')).toBe(
      '<p><a href="https://exemple.fr/a?b=1&amp;c=2" target="_blank" ' +
        'rel="noopener noreferrer nofollow">lien</a></p>',
    );
    expect(clean('<a href="/notes?note=1">interne</a>')).toContain('href="/notes?note=1"');
    expect(clean('<a href="mailto:mj@exemple.fr">mail</a>')).toContain('href="mailto:');
  });

  it.each([
    '<script>alert(1)</script>',
    '<SCRIPT SRC=//x.js></SCRIPT>',
    '<script/>alert(1)</script>',
    '<style>body{background:url(javascript:alert(1))}</style>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<svg><script>alert(1)</script></svg>',
    '<svg onload=alert(1)>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
    '<template><img src=x onerror=alert(1)></template>',
    '<object data="x.swf"></object>',
    '<textarea><img src=x onerror=alert(1)></textarea>',
    '<noscript><img src=x onerror=alert(1)></noscript>',
    '<!--<img src=x onerror=alert(1)>-->',
    '<!DOCTYPE html><?xml version="1.0"?>',
  ])('retire %s sans rien laisser d’actif', (html) => {
    const out = clean(html);
    expect(out).not.toMatch(/<(script|style|iframe|svg|math|template|object|textarea)/i);
    expect(out).not.toMatch(/onerror|onload|javascript/i);
  });

  it.each([
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="&#x6A;avascript&#58;alert(1)">x</a>',
    '<a href="javascript&colon;alert(1)">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="//evil.example/x">x</a>',
    '<a href="jav&#0;ascript:alert(1)">x</a>',
  ])('refuse le lien %s mais garde son texte', (html) => {
    const out = clean(html);
    expect(out).toBe('x');
  });

  it('retire tous les attributs hors liste (événements, style arbitraire, id, class)', () => {
    const out = clean(
      '<p onclick="alert(1)" style="color:red;background:url(x)" id="a" class="b">t</p>' +
        '<strong onmouseover="alert(1)">g</strong>',
    );
    expect(out).toBe('<p>t</p><strong>g</strong>');
  });

  it('garde l’alignement de l’ancien éditeur, rien d’autre du style', () => {
    expect(clean('<p style="text-align: center">c</p>')).toBe(
      '<p style="text-align: center">c</p>',
    );
    expect(clean('<h2 style="color: red; text-align:right;">t</h2>')).toBe(
      '<h2 style="text-align: right">t</h2>',
    );
    expect(clean('<p style="text-align: expression(alert(1))">x</p>')).toBe('<p>x</p>');
  });

  it('images : https, chemin du site ou notre stockage ; largeur de l’ancien éditeur', () => {
    expect(
      clean(
        '<img src="https://cdn.exemple.fr/a.png" alt="Carte" containerstyle="width: 320px; ' +
          'height: auto;" wrapperstyle="display: flex" onerror="alert(1)">',
      ),
    ).toBe('<img src="https://cdn.exemple.fr/a.png" alt="Carte" width="320">');
    expect(clean('<img src="http://localhost:8333/vtt/campaigns/x.webp">')).toBe(
      '<img src="http://localhost:8333/vtt/campaigns/x.webp">',
    );
    for (const src of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'http://tiers.example/pistage.png',
      '//tiers.example/a.png',
      'x',
    ])
      expect(clean(`<p><img src="${src}"></p>`)).toBe('<p></p>');
  });

  it('réencode le texte et les attributs : aucune évasion possible', () => {
    expect(clean('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(clean('<img src="https://a.fr/x.png" alt="&quot;><script>alert(1)</script>">')).toBe(
      '<img src="https://a.fr/x.png" alt="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">',
    );
    expect(clean('a < b > c & d')).toBe('a &lt; b &gt; c &amp; d');
    expect(clean('<p>&eacute;t&eacute; &inconnue;</p>')).toBe('<p>été &amp;inconnue;</p>');
  });

  it('HTML mal formé : balises refermées, fermantes orphelines et balise coupée ignorées', () => {
    expect(clean('<p><strong>gras<em>et italique</p>suite</strong>')).toBe(
      '<p><strong>gras<em>et italique</em></strong></p>suite',
    );
    expect(clean('</p></ul>texte<p')).toBe('texte');
    expect(clean('<p title="non fermé>x</p>')).toBe('');
    expect(clean('<b>B</b><i>I</i><strike>S</strike><del>D</del>')).toBe(
      '<strong>B</strong><em>I</em><s>S</s><s>D</s>',
    );
  });

  it('balises inconnues : retirées, leur texte gardé', () => {
    expect(clean('<div><span style="color:red">texte</span></div><font>f</font>')).toBe('textef');
  });

  it('extrait le texte brut et un aperçu sans les intertitres', () => {
    const r = sanitizeNoteHtml(
      '<h2>Résumé</h2><p>Les héros ont trouvé l’&eacute;pée.</p><h2>Butin</h2><ul><li><p>100 po</p></li></ul>',
      opts,
    );
    expect(r.text).toBe('Résumé Les héros ont trouvé l’épée. Butin 100 po');
    expect(r.preview).toBe('Les héros ont trouvé l’épée. 100 po');
    const long = sanitizeNoteHtml(`<p>${'mot '.repeat(200)}</p>`, opts);
    expect(long.preview.length).toBeLessThanOrEqual(281);
    expect(long.preview.endsWith('…')).toBe(true);
  });

  it('reste linéaire sur une entrée volumineuse', () => {
    const big = '<p>'.repeat(20_000) + 'x'.repeat(100_000);
    const started = performance.now();
    const r = sanitizeNoteHtml(big, opts);
    expect(r.text).toBe('x'.repeat(100_000));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('liens', () => {
  it('protocoles permis seulement', () => {
    expect(safeHref('https://a.fr')).toBe('https://a.fr');
    expect(safeHref('tel:+33600000000')).toBe('tel:+33600000000');
    expect(safeHref('#ancre')).toBe('#ancre');
    expect(safeHref('https://a.fr/un espace')).toBe('https://a.fr/un%20espace');
    expect(safeHref('ftp://a.fr')).toBeNull();
    expect(safeHref('relatif.html')).toBeNull();
  });
});

describe('forme de recherche', () => {
  it('sans accents, ligatures ni majuscules', () => {
    expect(searchForm('Épée ŒUVRE Straße Ça')).toBe('epee oeuvre strasse ca');
  });

  it('termes : lettres et chiffres, dédoublonnés, 10 au plus', () => {
    expect(searchTerms("  L'épée, l'ÉPÉE & le #dragon-rouge ")).toEqual([
      'l',
      'epee',
      'le',
      'dragon',
      'rouge',
    ]);
    expect(searchTerms('a b c d e f g h i j k l')).toHaveLength(10);
    expect(searchTerms('   ')).toEqual([]);
  });
});
