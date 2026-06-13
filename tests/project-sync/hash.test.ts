import { describe, it, expect } from 'vitest';
import { computeHash, isSynced } from '../../scripts/project-sync/hash';

describe('computeHash', () => {
  it('retourne un hash SHA-256 en hexadécimal de 64 caractères', () => {
    const hash = computeHash('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe : même contenu → même hash', () => {
    const content = 'CLAUDE_PROJECT test content';
    expect(computeHash(content)).toBe(computeHash(content));
  });

  it('hash SHA-256 connu de "hello"', () => {
    expect(computeHash('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('détecte un changement : contenus différents → hashs différents', () => {
    expect(computeHash('version A')).not.toBe(computeHash('version B'));
  });

  it('ne normalise pas les fins de ligne : LF ≠ CRLF', () => {
    expect(computeHash('line\n')).not.toBe(computeHash('line\r\n'));
  });

  it('prend en compte chaque octet : espace en fin de ligne = hash différent', () => {
    expect(computeHash('content')).not.toBe(computeHash('content '));
  });
});

describe('isSynced', () => {
  it('renvoie true quand le contenu correspond au hash stocké', () => {
    const content = 'synced content';
    const hash = computeHash(content);
    expect(isSynced(content, hash)).toBe(true);
  });

  it('renvoie false quand le contenu a changé', () => {
    const original = 'original';
    const modified = 'modified';
    const hash = computeHash(original);
    expect(isSynced(modified, hash)).toBe(false);
  });

  it('ignore les espaces/newlines en fin de hash stocké (trim)', () => {
    const content = 'trim test';
    const hash = computeHash(content);
    expect(isSynced(content, hash + '\n')).toBe(true);
    expect(isSynced(content, '  ' + hash + '  ')).toBe(true);
  });

  it('renvoie false si storedHash est vide', () => {
    expect(isSynced('anything', '')).toBe(false);
  });
});
