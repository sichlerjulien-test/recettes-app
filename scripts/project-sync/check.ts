import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { computeHash } from './hash';

const projectRoot = join(process.cwd());
const projectFile = join(projectRoot, 'CLAUDE_PROJECT.md');
const sentinelFile = join(projectRoot, 'scripts', 'project-sync', 'last-synced.sha256');

if (!existsSync(sentinelFile)) {
  console.error('ERREUR : scripts/project-sync/last-synced.sha256 est absent.');
  console.error('Lancez npm run sync:project pour l\'initialiser.');
  process.exit(1);
}

const content = readFileSync(projectFile, 'utf8');
const storedHash = readFileSync(sentinelFile, 'utf8').trim();
const currentHash = computeHash(content);

if (currentHash === storedHash) {
  console.log('OK : CLAUDE_PROJECT.md est synchronisé avec last-synced.sha256.');
  process.exit(0);
} else {
  console.error('ERREUR : CLAUDE_PROJECT.md a changé depuis la dernière synchronisation.');
  console.error('Lancez npm run sync:project pour confirmer que le contenu a été collé dans Claude.ai.');
  process.exit(1);
}
