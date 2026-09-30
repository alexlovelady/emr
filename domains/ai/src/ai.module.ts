import { Module } from '@nestjs/common';
import { AiGenerationController } from './generation/ai-generation.controller.js';
import { AmbientNoteDraftController } from './ambient-note-draft/ambient-note-draft.controller.js';
import { EncounterSummaryController } from './encounter-summary/encounter-summary.controller.js';
import { ChartQaController } from './chart-qa/chart-qa.controller.js';
import { MessageDraftController } from './message-draft/message-draft.controller.js';
import { CodingSuggestionController } from './coding-suggestion/coding-suggestion.controller.js';
import { ChargeCodingSuggestionController } from './coding-suggestion/charge-coding-suggestion.controller.js';
import { DenialSummaryController } from './denial-summary/denial-summary.controller.js';
import { AppealDraftController } from './appeal-draft/appeal-draft.controller.js';
import { TaskSummaryController } from './task-summary/task-summary.controller.js';
import { NlToCohortDslProposeController, NlToCohortDslExecuteController } from './nl-to-cohort-dsl/nl-to-cohort-dsl.controller.js';
import { LabResultExplanationController } from './lab-result-explanation/lab-result-explanation.controller.js';

@Module({
  controllers: [
    AiGenerationController,
    AmbientNoteDraftController,
    EncounterSummaryController,
    ChartQaController,
    MessageDraftController,
    CodingSuggestionController,
    ChargeCodingSuggestionController,
    DenialSummaryController,
    AppealDraftController,
    TaskSummaryController,
    NlToCohortDslProposeController,
    NlToCohortDslExecuteController,
    LabResultExplanationController,
  ],
})
export class AiModule {}
