import { randomUUID } from 'node:crypto';
import type {
  FormularyInfo,
  MedicationConcept,
  Pharmacy,
  PrescribingGateway,
  PrescriptionReceipt,
  PrescriptionSubmission,
  RefillResponseSubmission,
} from './prescribing-gateway.js';

const SYNTHETIC_MEDICATIONS: MedicationConcept[] = [
  { code: '308136', display: 'Amoxicillin 500 MG Oral Capsule', codeSystem: 'RxNorm' },
  { code: '857005', display: 'Lisinopril 10 MG Oral Tablet', codeSystem: 'RxNorm' },
  { code: '997223', display: 'Ibuprofen 200 MG Oral Tablet', codeSystem: 'RxNorm' },
];

const SYNTHETIC_PHARMACIES: Pharmacy[] = [
  {
    ncpdpId: '1234567',
    name: 'Synthetic Test Pharmacy #1',
    addressLine1: '1 Test Way',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    phone: '555-010-0001',
  },
  {
    ncpdpId: '7654321',
    name: 'Synthetic Test Pharmacy #2',
    addressLine1: '2 Fixture Ave',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62702',
    phone: '555-010-0002',
  },
];

/**
 * No real Surescripts-connected vendor exists in this environment. Search results come from a
 * small embedded synthetic dataset (never real pharmacy/medication data). `sendPrescription`
 * resolves synchronously with an accepted receipt — a real vendor call is async (an ACK arrives
 * later); this stub short-circuits that, a documented simplification matching
 * `NoopLabOrderGateway`'s "no real lab exists" stance.
 */
export class NoopPrescribingGateway implements PrescribingGateway {
  async searchMedication(query: string): Promise<MedicationConcept[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return SYNTHETIC_MEDICATIONS;
    return SYNTHETIC_MEDICATIONS.filter((m) => m.display.toLowerCase().includes(needle));
  }

  async searchPharmacy(query: string): Promise<Pharmacy[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return SYNTHETIC_PHARMACIES;
    return SYNTHETIC_PHARMACIES.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.postalCode.includes(needle),
    );
  }

  async getFormulary(medicationCode: string): Promise<FormularyInfo> {
    return { medicationCode, covered: true, tier: 2, priorAuthRequired: false, notes: null };
  }

  async sendPrescription(_submission: PrescriptionSubmission): Promise<PrescriptionReceipt> {
    return { externalId: `noop-rx-${randomUUID()}`, status: 'accepted', rejectReason: null, transmittedAt: new Date() };
  }

  async cancelPrescription(_externalId: string): Promise<void> {
    // No real pharmacy network to notify.
  }

  async refillResponse(_response: RefillResponseSubmission): Promise<void> {
    // No real pharmacy network to notify.
  }
}
