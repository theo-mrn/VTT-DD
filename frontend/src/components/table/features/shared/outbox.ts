/**
 * File d'envoi des états de table sur le canal éphémère. Le canal est « volatile » : un message
 * émis pendant que la connexion envoie encore le précédent est jeté. Au chargement, toutes les
 * fonctions demandent (ou répondent) dans le même instant ; seul le premier passerait. La file
 * espace les envois et ne garde que le dernier message de chaque clé (l'état le plus récent).
 */
const GAP_MS = 60;

const queue = new Map<string, () => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function drain() {
  timer = null;
  const first = queue.entries().next();
  if (first.done) return;
  const [key, send] = first.value;
  queue.delete(key);
  send();
  if (queue.size) timer = setTimeout(drain, GAP_MS);
}

/** Envoie `send` dès que possible, après les envois en attente ; remplace un envoi de même clé. */
export function enqueue(key: string, send: () => void) {
  queue.delete(key);
  queue.set(key, send);
  timer ??= setTimeout(drain, 0);
}
