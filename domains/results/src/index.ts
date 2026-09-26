export { ResultsModule } from './results.module.js';
export { DiagnosticReportService } from './diagnostic-report/diagnostic-report.service.js';
export { DiagnosticReportRepository, type DiagnosticReportRow } from './diagnostic-report/diagnostic-report.repository.js';
export {
  CreateDiagnosticReportSchema,
  type CreateDiagnosticReportInput,
  ReviewDiagnosticReportSchema,
  type ReviewDiagnosticReportInput,
  ResultValueSchema,
} from './diagnostic-report/diagnostic-report.dto.js';
