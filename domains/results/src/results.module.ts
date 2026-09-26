import { Module } from '@nestjs/common';
import {
  DiagnosticReportController,
  DiagnosticReportDetailController,
  ResultsInboxController,
} from './diagnostic-report/diagnostic-report.controller.js';
import { DiagnosticReportService } from './diagnostic-report/diagnostic-report.service.js';

@Module({
  controllers: [DiagnosticReportController, DiagnosticReportDetailController, ResultsInboxController],
  providers: [DiagnosticReportService],
})
export class ResultsModule {}
