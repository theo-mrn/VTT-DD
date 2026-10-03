#!/usr/bin/env node
// `pnpm dev` du service audio : le service (:3008, rechargement à chaud) et son worker
// ffmpeg (:3009, sans surveillance des fichiers : chaque surveillance de plus consomme les
// flux FSEvents de macOS, partagés avec Next et les autres services ; relancer `pnpm dev`
// après une modification du worker). Un seul processus pour turbo ; Ctrl+C arrête les deux.
import { spawn } from 'node:child_process';

const children = ['dev:service', 'dev:worker'].map((script) =>
  spawn('pnpm', ['run', '--silent', script], { stdio: 'inherit', shell: false }),
);
let exiting = false;
const stop = (code = 0) => {
  if (exiting) return;
  exiting = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
};
for (const c of children) c.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
