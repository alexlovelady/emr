import { Module } from '@nestjs/common';
import { PatientController } from './patient/patient.controller.js';
import { PatientService } from './patient/patient.service.js';
import { PatientIdentifierController } from './identifier/identifier.controller.js';
import { PatientIdentifierService } from './identifier/identifier.service.js';
import { CoverageController } from './coverage/coverage.controller.js';
import { CoverageService } from './coverage/coverage.service.js';
import { PatientTimelineController } from './timeline/patient-timeline.controller.js';
import { PatientTimelineService } from './timeline/patient-timeline.service.js';

@Module({
  controllers: [PatientController, PatientIdentifierController, CoverageController, PatientTimelineController],
  providers: [PatientService, PatientIdentifierService, CoverageService, PatientTimelineService],
})
export class PatientModule {}
