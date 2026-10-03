/**
 * Garde-fou du tunnel d'historique, pour les tests des services : liste les
 * routes d'écriture (POST, PUT, PATCH, DELETE) d'un service et dit si chacune
 * peut atteindre l'écriture d'un événement dans l'outbox (`appendEvent`).
 *
 * Analyse statique avec le vérificateur de types de TypeScript, pas des
 * expressions régulières :
 * - une route est un appel `.post/.put/.patch/.delete(url, …, handler)` sur
 *   une instance Fastify (reconnue par son type : `inject`, `addHook`,
 *   `register`), quel que soit le nom de la variable ;
 * - depuis le handler, chaque identifiant est résolu vers sa déclaration
 *   (imports, fonctions locales, méthodes d'objets, fabriques) et le code
 *   atteint est parcouru à son tour : `modifierPour` → `modifier` →
 *   `enregistrer` → `appendEvent` est suivi comme un appel direct.
 *
 * Limites (voir docs/bus.md) : l'analyse dit qu'un chemin vers l'émetteur
 * existe, pas qu'il est pris à chaque appel réussi (une branche sans
 * événement passe) ; un appel à travers une interface (dépendance injectée)
 * n'est pas suivi.
 */
import path from 'node:path';
import ts from 'typescript';

export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface WriteRoute {
  method: WriteMethod;
  /** URL de la route ; partie variable d'un gabarit rendue `{nom}`, `<dynamic>` sinon. */
  url: string;
  /** `fichier:ligne` de l'enregistrement, relatif au dossier du tsconfig. */
  location: string;
  /** Chemin d'appels du handler jusqu'à l'émetteur ; vide si aucun n'est atteint. */
  emitPath: string[];
}

export interface WriteRoutesOptions {
  /** Chemin absolu du tsconfig du service (ses fichiers forment le programme analysé). */
  tsconfig: string;
  /** Fonctions qui écrivent un événement : fichier relatif au tsconfig et nom exporté. */
  emitters: { file: string; name: string }[];
  /** Fichiers (relatifs au tsconfig) dont les routes sont ignorées, ex. faux services de test. */
  exclude?: (file: string) => boolean;
}

const METHODS: Record<string, WriteMethod> = {
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
};

/** Instance Fastify : reconnue à son type, pas au nom de la variable. */
function isFastify(checker: ts.TypeChecker, node: ts.Expression): boolean {
  const type = checker.getTypeAtLocation(node);
  return ['inject', 'addHook', 'register', 'withTypeProvider'].every(
    (p) => type.getProperty(p) !== undefined,
  );
}

function loadProgram(tsconfig: string): ts.Program {
  const read = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfig));
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
}

/** Déclaration nommée d'un fichier (fonction ou constante). */
function findDeclaration(file: ts.SourceFile, name: string): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (
      (ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === name
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return found;
}

/** Expression sans parenthèses ni assertions de type (`(f as X)!` → `f`). */
function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e)
  )
    e = e.expression;
  return e;
}

const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isArrowFunction(n) ||
  ts.isFunctionExpression(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isConstructorDeclaration(n);

/**
 * Code exécuté quand on utilise ce qu'une déclaration désigne, ou undefined :
 * corps d'une fonction, fonction ou référence affectée à une constante ou à
 * une propriété. Une constante calculée (`const repo = { … }`, `const x = f()`)
 * n'est pas suivie : ses membres le sont quand on les utilise (`repo.save`).
 */
function executableOf(decl: ts.Declaration): ts.Node | undefined {
  if (isFunctionLike(decl)) return decl.body;
  if ((ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)) && decl.initializer) {
    const init = unwrap(decl.initializer);
    if (
      ts.isArrowFunction(init) ||
      ts.isFunctionExpression(init) ||
      ts.isIdentifier(init) ||
      ts.isPropertyAccessExpression(init)
    )
      return init;
    return undefined;
  }
  if (ts.isShorthandPropertyAssignment(decl)) return decl.name;
  return undefined;
}

function nameOf(decl: ts.Declaration): string {
  const n = ts.getNameOfDeclaration(decl);
  return n ? n.getText() : '<anonyme>';
}

export function findWriteRoutes(options: WriteRoutesOptions): WriteRoute[] {
  const root = path.dirname(options.tsconfig);
  const program = loadProgram(options.tsconfig);
  const checker = program.getTypeChecker();
  const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');

  const emitters = new Set<ts.Node>();
  for (const e of options.emitters) {
    const file = program.getSourceFile(path.resolve(root, e.file));
    const decl = file && findDeclaration(file, e.name);
    if (!decl) throw new Error(`Émetteur introuvable : ${e.name} dans ${e.file}`);
    emitters.add(decl);
    // `const appendEvent = async (…) => …` : la signature résolue désigne la fonction
    if (ts.isVariableDeclaration(decl) && decl.initializer) emitters.add(unwrap(decl.initializer));
  }

  const inProject = (node: ts.Node) => {
    const f = node.getSourceFile();
    return !f.isDeclarationFile && !f.fileName.includes('/node_modules/');
  };

  /** Déclarations désignées par un identifiant (alias d'import résolus). */
  function declarationsOf(id: ts.Identifier): ts.Declaration[] {
    let symbol = ts.isShorthandPropertyAssignment(id.parent)
      ? checker.getShorthandAssignmentValueSymbol(id.parent)
      : checker.getSymbolAtLocation(id);
    if (!symbol) return [];
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol.declarations ?? [];
  }

  /** Chemin vers un émetteur depuis `start`, en profondeur ; `seen` évite les cycles. */
  function search(start: ts.Node, seen: Set<ts.Node>): string[] | null {
    let result: string[] | null = null;
    const follow = (decl: ts.Declaration, body: ts.Node | undefined): boolean => {
      if (emitters.has(decl)) {
        result = [nameOf(decl)];
        return true;
      }
      if (seen.has(decl) || !inProject(decl)) return false;
      seen.add(decl);
      const sub = body ? search(body, seen) : null;
      if (sub) result = [nameOf(decl), ...sub];
      return sub !== null;
    };
    const visit = (n: ts.Node): void => {
      if (result) return;
      if (ts.isIdentifier(n)) {
        for (const decl of declarationsOf(n)) if (follow(decl, executableOf(decl))) return;
        return;
      }
      // Signature résolue : fonction renvoyée par une fabrique, méthode, surcharge
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const decl = checker.getResolvedSignature(n)?.declaration;
        if (decl && isFunctionLike(decl) && follow(decl, decl.body)) return;
      }
      ts.forEachChild(n, visit);
    };
    visit(start);
    return result;
  }

  /**
   * URL d'une route : constante, ou gabarit dont les parties variables sont
   * rendues `{nom}` (`${base}/:itemId` → `{base}/:itemId`).
   */
  function urlOf(e: ts.Expression): string {
    if (ts.isStringLiteralLike(e)) return e.text;
    const t = checker.getTypeAtLocation(e);
    if (t.isStringLiteral()) return t.value;
    if (ts.isTemplateExpression(e))
      return e.templateSpans.reduce(
        (acc, span) => acc + urlOf(span.expression) + span.literal.text,
        e.head.text,
      );
    return ts.isIdentifier(e) ? `{${e.text}}` : '<dynamic>';
  }

  /** Handler d'une route : dernier argument (fonction, référence, ou `{ handler }`). */
  function handlerOf(call: ts.CallExpression): ts.Node | undefined {
    const last = call.arguments[call.arguments.length - 1];
    if (!last || call.arguments.length < 2) return undefined;
    if (ts.isObjectLiteralExpression(last))
      return last.properties.find((p) => p.name?.getText() === 'handler');
    return last;
  }

  const routes: WriteRoute[] = [];
  for (const file of program.getSourceFiles()) {
    if (!inProject(file)) continue;
    const name = rel(file.fileName);
    if (name.startsWith('..') || options.exclude?.(name)) continue;
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text in METHODS &&
        isFastify(checker, n.expression.expression)
      ) {
        const first = n.arguments[0];
        const url = first ? urlOf(first) : '<dynamic>';
        const handler = handlerOf(n);
        const line = file.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        routes.push({
          method: METHODS[n.expression.name.text]!,
          url,
          location: `${name}:${line}`,
          emitPath: (handler && search(handler, new Set())) ?? [],
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(file);
  }
  return routes.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
}

/** Clé d'une route : `POST /v1/…`. */
export const routeKey = (r: Pick<WriteRoute, 'method' | 'url'>) => `${r.method} ${r.url}`;
