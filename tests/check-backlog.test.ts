import { describe, it, expect } from 'vitest';
import { findBacklogViolations } from '../scripts/check-backlog';

const VALID_BACKLOG = `# Meal Planner — Backlog

## Ordre conseillé

TK-01 en tête.

---

## Tickets ouverts (détail)

### TK-01 — Ticket ouvert
Description sans marqueur de statut.

---

## Vue d'ensemble

| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| TK-01 | Ticket ouvert | P2 | S | À faire |
| TK-02 | Ticket dormant | P2 | — | Dormant |
`;

const VALID_ARCHIVE = `# Backlog — Archive

| Ticket | Titre | Statut | Réf |
|--------|-------|--------|-----|
| TK-03 | Ticket clos | Fait | PR #1 |
`;

describe('findBacklogViolations', () => {
  it('backlog + archive conformes → aucune violation', () => {
    expect(findBacklogViolations(VALID_BACKLOG, VALID_ARCHIVE)).toHaveLength(0);
  });

  it('ID dupliqué dans Vue d\'ensemble → fail', () => {
    const backlog = VALID_BACKLOG.replace(
      '| TK-02 | Ticket dormant | P2 | — | Dormant |',
      '| TK-02 | Ticket dormant | P2 | — | Dormant |\n| TK-01 | Doublon | P2 | S | À faire |',
    );
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'duplicate-id-in-table')).toBe(true);
  });

  it('statut hors À faire/Dormant dans Vue d\'ensemble → fail', () => {
    const backlog = VALID_BACKLOG.replace(
      '| TK-02 | Ticket dormant | P2 | — | Dormant |',
      '| TK-02 | Ticket clos par erreur | P2 | — | Fait |',
    );
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'invalid-status-in-table')).toBe(true);
  });

  it('ID présent à la fois dans le backlog et l\'archive → fail', () => {
    const archive = VALID_ARCHIVE.replace('TK-03', 'TK-01');
    const violations = findBacklogViolations(VALID_BACKLOG, archive);
    expect(violations.some(v => v.rule === 'id-in-both-backlog-and-archive')).toBe(true);
  });

  it('marqueur de statut dans la prose → fail', () => {
    const backlog = VALID_BACKLOG.replace(
      'Description sans marqueur de statut.',
      'Description ✅ Livré la semaine dernière.',
    );
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'status-marker-in-prose')).toBe(true);
  });

  it('« Ordre conseillé » référence un ticket non À faire → fail', () => {
    const backlog = VALID_BACKLOG.replace(
      'TK-01 en tête.',
      'TK-01 en tête, puis TK-02.',
    );
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'ordre-conseille-references-non-a-faire')).toBe(true);
  });

  it('bloc "Ordre conseillé" en double → fail', () => {
    const backlog = VALID_BACKLOG.replace(
      '---\n\n## Tickets ouverts (détail)',
      '---\n\n## Ordre conseillé\n\nDoublon.\n\n---\n\n## Tickets ouverts (détail)',
    );
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'single-ordre-conseille')).toBe(true);
  });

  it('table "Vue d\'ensemble" en double → fail', () => {
    const backlog = `${VALID_BACKLOG}\n\n## Vue d'ensemble\n\n| Ticket | Titre | Priorité | Effort | Statut |\n|--------|-------|----------|--------|--------|\n| TK-04 | Doublon table | P2 | S | À faire |\n`;
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'single-vue-ensemble')).toBe(true);
  });

  it('prose sans ligne correspondante dans Vue d\'ensemble → fail', () => {
    const backlog = VALID_BACKLOG.replace(
      '### TK-01 — Ticket ouvert',
      '### TK-01 — Ticket ouvert\n\n### TK-99 — Fantôme sans ligne de table',
    );
    const violations = findBacklogViolations(backlog, VALID_ARCHIVE);
    expect(violations.some(v => v.rule === 'prose-id-not-in-table')).toBe(true);
  });
});
