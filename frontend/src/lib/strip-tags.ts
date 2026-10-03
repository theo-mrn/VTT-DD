/**
 * Retire les balises d'un HTML (`<…>`, au moins un caractère entre les chevrons), comme
 * `/<[^>]+>/g` mais en temps linéaire : l'expression repart de chaque « < » non fermé d'un
 * texte saisi (temps quadratique).
 */
export function stripTags(html: string, replacement = ''): string {
  let out = '';
  let from = 0;
  let at = html.indexOf('<');
  while (at >= 0) {
    const close = html.indexOf('>', at + 1);
    if (close < 0) break;
    if (close > at + 1) {
      out += html.slice(from, at) + replacement;
      from = close + 1;
      at = html.indexOf('<', from);
    } else at = html.indexOf('<', at + 1);
  }
  return out + html.slice(from);
}
