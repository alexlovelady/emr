import { defineConfig } from 'vitest/config';

/**
 * CLI glob flags (e.g. `vitest run --exclude '**\/*.integration.test.ts'`) get mangled by
 * Windows' cmd.exe when invoked through pnpm/npm scripts (npm-lifecycle always shells out via
 * the OS default shell, regardless of which shell launched pnpm) — the exclude pattern silently
 * fails to apply. Config-file-based include/exclude sidesteps shell quoting entirely and is
 * portable across platforms and CI, so every package uses this pattern rather than CLI flags.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
});
