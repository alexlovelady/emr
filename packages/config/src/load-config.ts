import { envSchema, testEnvDefaults, type Env } from './env-schema.js';

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Fail-fast environment loading (EHR_BUILD_SPEC.md rule of thumb: prefer explicit state over
 * loosely interpreted status/config). Outside NODE_ENV=test, every required variable must be
 * present in `source` (defaults to process.env) or this throws before the app does anything
 * else. In tests, missing variables fall back to `testEnvDefaults` so specs don't need a full
 * .env.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Env {
  const isTest = source.NODE_ENV === 'test';
  const merged = isTest ? { ...testEnvDefaults, ...source } : source;

  const result = envSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigValidationError(issues);
  }
  return result.data;
}

let cached: Env | undefined;

/** Memoized accessor — call loadConfig() directly in tests that need a fresh parse. */
export function getConfig(): Env {
  cached ??= loadConfig();
  return cached;
}

/** Test-only escape hatch to reset the memoized config between specs. */
export function __resetConfigCacheForTests(): void {
  cached = undefined;
}
