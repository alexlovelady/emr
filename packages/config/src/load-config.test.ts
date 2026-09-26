import { describe, expect, it } from 'vitest';
import { loadConfig, ConfigValidationError } from './load-config.js';

describe('loadConfig', () => {
  it('loads successfully in test mode with no explicit env vars beyond NODE_ENV', () => {
    const config = loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3000);
    expect(config.OBJECT_STORAGE_FORCE_PATH_STYLE).toBe(true);
  });

  it('throws a descriptive ConfigValidationError outside test mode when required vars are missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toThrow(
      ConfigValidationError,
    );
  });

  it('respects explicit overrides even in test mode', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORT: '4000',
    } as unknown as NodeJS.ProcessEnv);
    expect(config.PORT).toBe(4000);
  });
});
