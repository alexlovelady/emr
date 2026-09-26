export { QueryModule } from './query.module.js';
export { SEARCH_INDEX_GATEWAY } from './search-index-gateway.token.js';
export { CohortService } from './cohort/cohort.service.js';
export { CohortRepository, type CohortRow, type CohortExecutionRow } from './cohort/cohort.repository.js';
export { compileAndRun, type CohortCompileResult } from './cohort/cohort-compiler.js';
export {
  CohortDslSchema,
  type CohortDsl,
  type CohortCondition,
  SaveCohortSchema,
  type SaveCohortInput,
  ExecuteAdHocCohortSchema,
  type ExecuteAdHocCohortInput,
} from './cohort/cohort.dto.js';
export { GOVERNED_QUERIES } from './governed-query/governed-query.registry.js';
export { reindexPatients, reindexDocuments, reindexClaims } from './search/reindex.js';
