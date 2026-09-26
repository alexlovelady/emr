import { Module } from '@nestjs/common';
import { CohortController, CohortDetailController, CohortExecutionController } from './cohort/cohort.controller.js';
import { GovernedQueryController } from './governed-query/governed-query.controller.js';
import { SearchController } from './search/search.controller.js';

@Module({
  controllers: [CohortController, CohortDetailController, CohortExecutionController, GovernedQueryController, SearchController],
})
export class QueryModule {}
