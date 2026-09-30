export { GenomicsModule } from './genomics.module.js';
export { GenomicReportService, type GenomicReportWithFindings } from './genomic-report/genomic-report.service.js';
export {
  GenomicReportRepository,
  type GenomicReportRow,
  type GenomicFindingRow,
} from './genomic-report/genomic-report.repository.js';
export {
  CreateGenomicReportSchema,
  type CreateGenomicReportInput,
  ReviewGenomicReportSchema,
  type ReviewGenomicReportInput,
  GenomicFindingSchema,
  type GenomicFindingInput,
} from './genomic-report/genomic-report.dto.js';
