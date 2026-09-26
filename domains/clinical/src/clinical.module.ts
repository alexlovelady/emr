import { Module } from '@nestjs/common';
import { EncounterController } from './encounter/encounter.controller.js';
import { EncounterService } from './encounter/encounter.service.js';
import { NoteTemplateController } from './note-template/note-template.controller.js';
import { NoteTemplateService } from './note-template/note-template.service.js';
import { NoteController } from './note/note.controller.js';
import { NoteService } from './note/note.service.js';
import { ProblemController, ProblemDetailController } from './problem/problem.controller.js';
import { ProblemService } from './problem/problem.service.js';
import { AllergyController, AllergyDetailController } from './allergy/allergy.controller.js';
import { AllergyService } from './allergy/allergy.service.js';
import { ObservationController, ObservationDetailController } from './observation/observation.controller.js';
import { ObservationService } from './observation/observation.service.js';
import { ProcedureController, ProcedureDetailController } from './procedure/procedure.controller.js';
import { ProcedureService } from './procedure/procedure.service.js';

@Module({
  controllers: [
    EncounterController,
    NoteTemplateController,
    NoteController,
    ProblemController,
    ProblemDetailController,
    AllergyController,
    AllergyDetailController,
    ObservationController,
    ObservationDetailController,
    ProcedureController,
    ProcedureDetailController,
  ],
  providers: [
    EncounterService,
    NoteTemplateService,
    NoteService,
    ProblemService,
    AllergyService,
    ObservationService,
    ProcedureService,
  ],
})
export class ClinicalModule {}
