import { defineConfig } from 'vitest/config';

/** The Phase 1 exit gate (EHR_BUILD_SPEC.md §18.2) as its own named, non-skippable CI job. */
export default defineConfig({
  test: {
    include: ['**/*.tenant-isolation.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
