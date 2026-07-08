import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

describe('buildCsp', () => {
  it("production n'autorise jamais 'unsafe-eval'", () => {
    expect(buildCsp('production')).not.toContain('unsafe-eval');
  });

  it("le développement autorise 'unsafe-eval' (Fast Refresh)", () => {
    expect(buildCsp('development')).toContain('unsafe-eval');
  });

  it("undefined (build par défaut) n'autorise pas 'unsafe-eval'", () => {
    expect(buildCsp(undefined)).not.toContain('unsafe-eval');
  });
});
