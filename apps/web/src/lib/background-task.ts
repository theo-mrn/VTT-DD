/**
 * Remplaçant de `waitUntil` de @vercel/functions.
 *
 * Sur Vercel, `waitUntil` empêchait le runtime serverless de terminer la lambda
 * avant la fin des tâches lancées après la réponse HTTP. Sur le cluster k3s, le
 * process Node reste vivant : une promesse continue naturellement après la
 * réponse. Ce helper garde deux garanties que la promesse nue perdrait :
 *
 * - les rejets sont journalisés au lieu de remonter en `unhandledRejection` ;
 * - les tâches en cours sont suivies, pour qu'un arrêt propre (SIGTERM) puisse
 *   les attendre via `waitForBackgroundTasks()` plutôt que de les interrompre.
 */

const enCours = new Set<Promise<unknown>>();

/**
 * Lance une tâche de fond sans bloquer la réponse HTTP.
 * Signature compatible avec l'ancien `waitUntil`.
 */
export function waitUntil(tache: Promise<unknown>): void {
    enCours.add(tache);

    void tache
        .catch((erreur) => {
            console.error('[background-task] échec d\'une tâche de fond', erreur);
        })
        .finally(() => {
            enCours.delete(tache);
        });
}

/**
 * Attend la fin des tâches de fond en cours, au maximum `timeoutMs`.
 * À appeler pendant le drainage SIGTERM.
 */
export async function waitForBackgroundTasks(timeoutMs = 10_000): Promise<void> {
    if (enCours.size === 0) return;

    await Promise.race([
        Promise.allSettled([...enCours]),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

/** Nombre de tâches de fond en cours (sondes, tests). */
export function pendingBackgroundTasks(): number {
    return enCours.size;
}
