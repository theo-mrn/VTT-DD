import type React from 'react';
import type { ScriptDoc } from '@/modules/game-content/types';
import type { VTTModuleSDK } from '@/modules/sdk';
import type { BundleScriptAPI, BundleScriptContext, BundleContributions } from './types';
import type { GameSystemDefinition } from '@/modules/game-system/types';

// Linker CJS minimal sur les scripts transpilés d'un bundle (sortie sucrase transform 'imports').
// Chaque module est évalué paresseusement via new Function avec React/api/ui/icons injectés — le
// require() ne résout QUE les chemins relatifs internes au bundle : les dépendances externes passent
// par les globals fournis, jamais par un vrai import réseau/npm.

const SCRIPT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/** Résout un specifier relatif ('./x', '../lib/y') contre le chemin du module importeur. */
function resolveRelative(importerPath: string, spec: string): string {
  const importerDir = importerPath.split('/').slice(0, -1);
  const segments = [...importerDir];
  for (const part of spec.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) throw new Error(`Import hors du bundle : '${spec}' depuis ${importerPath}`);
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join('/');
}

export interface LinkerGlobals {
  React: typeof React;
  api: BundleScriptAPI;
  ui: VTTModuleSDK['ui'];
  icons: VTTModuleSDK['icons'];
}

interface LinkedModule {
  exports: Record<string, unknown>;
  evaluated: boolean;
}

/** Évalue le point d'entrée (scripts/main.*) et appelle son export default — la fonction register du
 *  bundle — avec le BundleScriptContext. Lève une erreur claire si l'entrée ou son export default
 *  manquent ; l'appelant (ExtensionHost) entoure le tout d'un try/catch : un bundle cassé ne doit
 *  jamais empêcher la salle de charger. */
export function executeBundleEntry(
  scriptDocs: ScriptDoc[],
  globals: LinkerGlobals & { register: (c: BundleContributions) => void; gameSystem: GameSystemDefinition }
): void {
  const byPath = new Map(scriptDocs.map((d) => [d.path, d]));
  const cache = new Map<string, LinkedModule>();

  // Specifiers nus tolérés : mappés sur les globals injectés (l'interop CJS de sucrase enveloppe un
  // module sans __esModule en { default: ... }, donc `import React from 'react'` fonctionne tel quel).
  const builtins: Record<string, unknown> = {
    react: globals.React,
    'lucide-react': globals.icons,
  };

  const loadModule = (path: string): Record<string, unknown> => {
    const cached = cache.get(path);
    // Cache de cycles CJS : exports enregistré AVANT l'évaluation du corps — un cycle A→B→A rend
    // l'objet exports partiel de A au lieu de boucler à l'infini, comme Node.
    if (cached) return cached.exports;
    const docFound = byPath.get(path);
    if (!docFound) throw new Error(`Module introuvable dans le bundle : ${path}`);
    const mod: LinkedModule = { exports: {}, evaluated: false };
    cache.set(path, mod);

    const require = (spec: string): Record<string, unknown> => {
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        if (spec in builtins) return builtins[spec] as Record<string, unknown>;
        throw new Error(`Import interdit : '${spec}' (${path}) — seuls les chemins relatifs du bundle et ${Object.keys(builtins).join('/')} sont résolus, utilisez React/api/ui/icons fournis en globals.`);
      }
      const base = resolveRelative(path, spec);
      const candidates = [
        base,
        ...SCRIPT_EXTENSIONS.map((ext) => `${base}${ext}`),
        ...SCRIPT_EXTENSIONS.map((ext) => `${base}/index${ext}`),
      ];
      const resolved = candidates.find((c) => byPath.has(c));
      if (!resolved) throw new Error(`Import non résolu : '${spec}' depuis ${path}`);
      return loadModule(resolved);
    };

    const fn = new Function('require', 'module', 'exports', 'React', 'api', 'ui', 'icons', docFound.compiled);
    fn(require, mod, mod.exports, globals.React, globals.api, globals.ui, globals.icons);
    mod.evaluated = true;
    return mod.exports;
  };

  const entryPath = SCRIPT_EXTENSIONS.map((ext) => `scripts/main${ext}`).find((p) => byPath.has(p));
  if (!entryPath) {
    throw new Error("Bundle de scripts sans point d'entrée : scripts/main.tsx (ou .ts/.jsx/.js) attendu.");
  }
  const entryExports = loadModule(entryPath);
  // Interop CJS de sucrase : l'export default vit dans exports.default ; un module écrit directement
  // en module.exports = fn reste accepté.
  const registerFn = (entryExports.default ?? entryExports) as unknown;
  if (typeof registerFn !== 'function') {
    throw new Error(`${entryPath} doit exporter par défaut une fonction (ctx) => void.`);
  }
  const ctx: BundleScriptContext = {
    React: globals.React,
    ui: globals.ui,
    icons: globals.icons,
    api: globals.api,
    gameSystem: globals.gameSystem,
    register: globals.register,
  };
  (registerFn as (c: BundleScriptContext) => void)(ctx);
}
