/**
 * Gate CI figeant la structure de BACKLOG.md (ADR-026, TK-70) : statut unique
 * dans « Vue d'ensemble », prose sans marqueur de statut, archive disjointe,
 * « Ordre conseillé » unique et limité aux tickets À faire.
 *
 * Usage : npx tsx scripts/check-backlog.ts
 * Exit 0 = OK, exit 1 = violations (listées sur stderr).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BACKLOG_PATH = 'BACKLOG.md';
const ARCHIVE_PATH = 'BACKLOG_ARCHIVE.md';

const OPEN_STATUSES = ['À faire', 'Dormant'];
const STATUS_MARKER_RE = /(✅|\bLivré\b|\bFait\b|\bAnnulé\b)/;
const TICKET_ID_RE = /TK-\d+[a-z]?/g;

export interface BacklogViolation {
  rule: string;
  detail: string;
}

function extractSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => l.trim() === heading);
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i] ?? '')) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n');
}

function countHeadingOccurrences(content: string, heading: string): number {
  const re = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm');
  return (content.match(re) ?? []).length;
}

function parseTableRows(section: string): { id: string; status: string }[] {
  const rows: { id: string; status: string }[] = [];
  for (const line of section.split('\n')) {
    const match = /^\|\s*(TK-\d+[a-z]?)\s*\|(.*)\|\s*$/.exec(line);
    if (!match) continue;
    const cells = (match[2] ?? '').split('|').map(c => c.trim());
    const status = cells[cells.length - 1] ?? '';
    rows.push({ id: match[1]!, status });
  }
  return rows;
}

function parseProseBlocks(content: string): { id: string; body: string }[] {
  const lines = content.split('\n');
  const headerIdxs: { idx: number; id: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^###\s+(TK-\d+[a-z]?)\b/.exec(lines[i] ?? '');
    if (match) headerIdxs.push({ idx: i, id: match[1]! });
  }
  const blocks: { id: string; body: string }[] = [];
  for (let i = 0; i < headerIdxs.length; i++) {
    const header = headerIdxs[i]!;
    const start = header.idx;
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (/^##\s/.test(lines[j] ?? '')) {
        end = j;
        break;
      }
    }
    blocks.push({ id: header.id, body: lines.slice(start, end).join('\n') });
  }
  return blocks;
}

export function findBacklogViolations(
  backlogContent: string,
  archiveContent: string,
): BacklogViolation[] {
  const violations: BacklogViolation[] = [];

  const ordreCount = countHeadingOccurrences(backlogContent, '## Ordre conseillé');
  const vueCount = countHeadingOccurrences(backlogContent, '## Vue d\'ensemble');
  if (ordreCount !== 1) {
    violations.push({
      rule: 'single-ordre-conseille',
      detail: `${ordreCount} occurrence(s) de "## Ordre conseillé" (attendu : 1)`,
    });
  }
  if (vueCount !== 1) {
    violations.push({
      rule: 'single-vue-ensemble',
      detail: `${vueCount} occurrence(s) de "## Vue d'ensemble" (attendu : 1)`,
    });
  }

  const vueSection = extractSection(backlogContent, '## Vue d\'ensemble');
  const tableRows = parseTableRows(vueSection);

  const seenIds = new Set<string>();
  const openIds = new Set<string>();
  for (const row of tableRows) {
    if (seenIds.has(row.id)) {
      violations.push({ rule: 'duplicate-id-in-table', detail: row.id });
    }
    seenIds.add(row.id);

    if (!OPEN_STATUSES.includes(row.status)) {
      violations.push({
        rule: 'invalid-status-in-table',
        detail: `${row.id} : statut "${row.status}" (attendu : À faire | Dormant)`,
      });
    } else {
      if (row.status === 'À faire') openIds.add(row.id);
    }
  }

  const archiveSection = archiveContent;
  const archiveIds = new Set<string>();
  for (const match of archiveSection.matchAll(/^\|\s*(TK-\d+[a-z]?)\s*\|/gm)) {
    archiveIds.add(match[1]!);
  }
  for (const id of seenIds) {
    if (archiveIds.has(id)) {
      violations.push({ rule: 'id-in-both-backlog-and-archive', detail: id });
    }
  }

  const proseBlocks = parseProseBlocks(backlogContent);
  for (const block of proseBlocks) {
    if (!seenIds.has(block.id)) {
      violations.push({
        rule: 'prose-id-not-in-table',
        detail: `${block.id} : prose sans ligne correspondante dans Vue d'ensemble`,
      });
    }
    if (STATUS_MARKER_RE.test(block.body)) {
      violations.push({
        rule: 'status-marker-in-prose',
        detail: `${block.id} : marqueur de statut (✅ / Livré / Fait / Annulé) trouvé dans la prose`,
      });
    }
  }

  const ordreSection = extractSection(backlogContent, '## Ordre conseillé');
  const ordreIds = new Set(ordreSection.match(TICKET_ID_RE) ?? []);
  for (const id of ordreIds) {
    if (!openIds.has(id)) {
      violations.push({
        rule: 'ordre-conseille-references-non-a-faire',
        detail: `${id} référencé dans "Ordre conseillé" mais pas "À faire" dans la table`,
      });
    }
  }

  return violations;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const backlogContent = readFileSync(BACKLOG_PATH, 'utf8');
  const archiveContent = readFileSync(ARCHIVE_PATH, 'utf8');
  const violations = findBacklogViolations(backlogContent, archiveContent);

  if (violations.length > 0) {
    process.stderr.write('[check-backlog] FAIL — violations de structure BACKLOG.md (ADR-026) :\n');
    for (const v of violations) {
      process.stderr.write(`  - [${v.rule}] ${v.detail}\n`);
    }
    process.exit(1);
  }

  console.log('[check-backlog] OK — BACKLOG.md conforme à ADR-026');
}
