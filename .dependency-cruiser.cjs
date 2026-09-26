/**
 * Structural enforcement of EHR_BUILD_SPEC.md rule #3 / §6.3: no module may open its own
 * unscoped Postgres connection and thereby bypass packages/db's withTenantContext() /
 * Row-Level-Security chokepoint.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-raw-pg-outside-db-package',
      comment:
        "Only packages/db may import 'pg' or 'kysely' directly. Every other module must go " +
        'through packages/db\'s withTenantContext() so tenant scoping (RLS session var) is ' +
        'never skippable.',
      severity: 'error',
      from: {
        pathNot: '^packages/db/',
      },
      to: {
        path: '^(pg|kysely)$',
      },
    },
    {
      name: 'no-orphans',
      comment: 'Modules with no incoming/outgoing dependencies are usually dead code.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.(test|spec)\\.ts$',
          'README\\.md$',
          'vitest\\.\\S*config\\.ts$',
          '(^|/)migrations/',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)dist/',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
