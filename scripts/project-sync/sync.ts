import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as readline from 'node:readline';
import { computeHash } from './hash';

const projectRoot = join(process.cwd());
const projectFile = join(projectRoot, 'CLAUDE_PROJECT.md');
const sentinelFile = join(projectRoot, 'scripts', 'project-sync', 'last-synced.sha256');

const content = readFileSync(projectFile, 'utf8');
const currentHash = computeHash(content);

if (existsSync(sentinelFile)) {
  const storedHash = readFileSync(sentinelFile, 'utf8').trim();
  if (currentHash === storedHash) {
    console.log('Déjà synchronisé. Rien à faire.');
    process.exit(0);
  }
}

console.log('=== CLAUDE_PROJECT.md — Contenu à coller dans la config Claude.ai ===\n');
console.log(content);
console.log('=== Fin du contenu ===\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('As-tu collé ce contenu dans la config Claude.ai ? (y/N) ', (answer) => {
  rl.close();
  if (answer.toLowerCase() === 'y') {
    writeFileSync(sentinelFile, currentHash + '\n', 'utf8');
    console.log('Hash mis à jour dans last-synced.sha256.');
    process.exit(0);
  } else {
    console.error('Annulé. last-synced.sha256 n\'a pas été modifié.');
    process.exit(1);
  }
});
