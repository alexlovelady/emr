import { Module } from '@nestjs/common';
import {
  GenomicReportController,
  GenomicReportDetailController,
  GenomicResultsInboxController,
} from './genomic-report/genomic-report.controller.js';
import { GenomicReportService } from './genomic-report/genomic-report.service.js';

@Module({
  controllers: [GenomicReportController, GenomicReportDetailController, GenomicResultsInboxController],
  providers: [GenomicReportService],
})
export class GenomicsModule {}
