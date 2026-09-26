import { Module } from '@nestjs/common';
import { MedicationController, MedicationDetailController } from './medication/medication.controller.js';
import { MedicationService } from './medication/medication.service.js';
import { MedicationReconciliationController } from './reconciliation/reconciliation.controller.js';
import { MedicationReconciliationService } from './reconciliation/reconciliation.service.js';

@Module({
  controllers: [MedicationController, MedicationDetailController, MedicationReconciliationController],
  providers: [MedicationService, MedicationReconciliationService],
})
export class MedicationModule {}
