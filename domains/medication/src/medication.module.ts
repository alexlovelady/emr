import { Module } from '@nestjs/common';
import { MedicationController, MedicationDetailController } from './medication/medication.controller.js';
import { MedicationService } from './medication/medication.service.js';
import { MedicationReconciliationController } from './reconciliation/reconciliation.controller.js';
import { MedicationReconciliationService } from './reconciliation/reconciliation.service.js';
import { PrescriptionController, PrescriptionDetailController, RefillRequestController } from './prescription/prescription.controller.js';
import { ErxLookupController } from './prescription/erx-lookup.controller.js';

@Module({
  controllers: [
    MedicationController,
    MedicationDetailController,
    MedicationReconciliationController,
    PrescriptionController,
    PrescriptionDetailController,
    RefillRequestController,
    ErxLookupController,
  ],
  providers: [MedicationService, MedicationReconciliationService],
})
export class MedicationModule {}
