export { ClinicalModule } from './clinical.module.js';

export { EncounterService } from './encounter/encounter.service.js';
export { EncounterRepository, type EncounterRow } from './encounter/encounter.repository.js';
export { CreateEncounterSchema, type CreateEncounterInput } from './encounter/encounter.dto.js';

export { NoteTemplateService } from './note-template/note-template.service.js';
export { NoteTemplateRepository, type NoteTemplateRow } from './note-template/note-template.repository.js';
export { CreateNoteTemplateSchema, type CreateNoteTemplateInput } from './note-template/note-template.dto.js';

export { NoteService, type NoteWithChain } from './note/note.service.js';
export { NoteRepository, type NoteRow } from './note/note.repository.js';
export {
  CreateNoteSchema,
  type CreateNoteInput,
  UpdateNoteContentSchema,
  type UpdateNoteContentInput,
  VoidNoteSchema,
  type VoidNoteInput,
} from './note/note.dto.js';

export { ProblemService } from './problem/problem.service.js';
export { ProblemRepository, type ProblemRow } from './problem/problem.repository.js';
export {
  CreateProblemSchema,
  type CreateProblemInput,
  UpdateProblemStatusSchema,
  type UpdateProblemStatusInput,
} from './problem/problem.dto.js';

export { AllergyService } from './allergy/allergy.service.js';
export { AllergyRepository, type AllergyRow } from './allergy/allergy.repository.js';
export { CreateAllergySchema, type CreateAllergyInput } from './allergy/allergy.dto.js';

export { ObservationService } from './observation/observation.service.js';
export { ObservationRepository, type ObservationRow } from './observation/observation.repository.js';
export { CreateObservationSchema, type CreateObservationInput } from './observation/observation.dto.js';

export { ProcedureService } from './procedure/procedure.service.js';
export { ProcedureRepository, type ProcedureRow } from './procedure/procedure.repository.js';
export { CreateProcedureSchema, type CreateProcedureInput } from './procedure/procedure.dto.js';
