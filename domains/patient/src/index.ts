export { PatientModule } from './patient.module.js';
export { PatientService } from './patient/patient.service.js';
export { PatientRepository, type PatientRow, type DuplicateCandidate } from './patient/patient.repository.js';
export {
  PatientMergeHistoryRepository,
  type PatientMergeHistoryRow,
} from './patient/merge-history.repository.js';
export {
  CreatePatientSchema,
  type CreatePatientInput,
  FindDuplicatesQuerySchema,
  type FindDuplicatesQuery,
  MergePatientsSchema,
  type MergePatientsInput,
  UpdatePatientContactSchema,
  type UpdatePatientContactInput,
} from './patient/patient.dto.js';
export { PatientIdentifierService } from './identifier/identifier.service.js';
export { PatientIdentifierRepository, type PatientIdentifierRow } from './identifier/identifier.repository.js';
export { CreatePatientIdentifierSchema, type CreatePatientIdentifierInput } from './identifier/identifier.dto.js';
export { CoverageService } from './coverage/coverage.service.js';
export { CoverageRepository, type CoverageRow } from './coverage/coverage.repository.js';
export { CreateCoverageSchema, type CreateCoverageInput } from './coverage/coverage.dto.js';
export { PatientTimelineService, type PatientTimeline, type TimelineEntry } from './timeline/patient-timeline.service.js';
