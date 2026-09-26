import type { ScriptDoc } from '@/modules/game-content/types';

// Transpilation des scripts d'un bundle de règles — au moment de l'IMPORT uniquement (sucrase est
// importé dynamiquement : son poids ne rejoint jamais les chunks des joueurs, seul le MJ qui importe
// un zip le télécharge). Aucun type-checking : les erreurs de type surfacent à l'exécution, protégées
// par le try/catch de l'ExtensionHost.

/** Un fichier de script au-delà de cette taille est refusé : source+compiled doivent rester très en
 *  dessous de la limite Firestore de 1 Mo/doc (un vrai script de bundle fait quelques Ko). */
const MAX_SCRIPT_BYTES = 300_000;

/** Transpile chaque scripts/**.{tsx,ts,jsx,js} du bundle en CJS. JSX 'classic' → React.createElement
 *  (React est injecté par le linker, aucun import jsx-runtime à résoudre) ; transform 'imports' →
 *  require()/exports CJS, consommés par executeBundleEntry. Une erreur de syntaxe fait échouer TOUT
 *  l'import avec le chemin fautif : un jeu de scripts à moitié importé est pire qu'une erreur claire. */
export async function transpileBundleScripts(scripts: Map<string, string>): Promise<ScriptDoc[]> {
  const { transform } = await import('sucrase');
  const docs: ScriptDoc[] = [];
  for (const [path, source] of scripts) {
    if (source.length > MAX_SCRIPT_BYTES) {
      throw new Error(`Script trop volumineux : ${path} (${Math.round(source.length / 1024)} Ko, max ${MAX_SCRIPT_BYTES / 1000} Ko).`);
    }
    try {
      const { code } = transform(source, {
        transforms: ['typescript', 'jsx', 'imports'],
        jsxRuntime: 'classic',
        production: true,
        filePath: path,
      });
      docs.push({ kind: 'script', name: path, path, source, compiled: code });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur de compilation dans ${path} : ${message}`);
    }
  }
  return docs;
}
