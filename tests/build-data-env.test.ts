import { describe, it, expect, afterEach } from 'vitest';
import { resolveEnvFile, isProdEnvFile } from '../scripts/resolve-env-file';

describe('resolveEnvFile', () => {
  afterEach(() => {
    delete process.env.ENV_FILE;
  });

  it('retourne ENV_FILE quand il est défini', () => {
    process.env.ENV_FILE = '.env.prod.local';
    expect(resolveEnvFile()).toBe('.env.prod.local');
  });

  it('retombe sur .env.local quand ENV_FILE est absent', () => {
    expect(resolveEnvFile()).toBe('.env.local');
  });
});

describe('isProdEnvFile', () => {
  it('reconnaît .env.prod.local comme prod', () => {
    expect(isProdEnvFile('.env.prod.local')).toBe(true);
  });

  it('reconnaît .env.prod comme prod', () => {
    expect(isProdEnvFile('.env.prod')).toBe(true);
  });

  it('ne confond pas .env.local avec prod', () => {
    expect(isProdEnvFile('.env.local')).toBe(false);
  });

  it('ne confond pas .env avec prod', () => {
    expect(isProdEnvFile('.env')).toBe(false);
  });
});
