import { describe, expect, it } from 'vitest';
import { NoopPrescribingGateway } from './noop-prescribing-gateway.js';

describe('NoopPrescribingGateway', () => {
  it('filters synthetic medications by a case-insensitive substring match', async () => {
    const gateway = new NoopPrescribingGateway();
    const results = await gateway.searchMedication('lisinopril');
    expect(results).toHaveLength(1);
    expect(results[0]?.display).toContain('Lisinopril');
  });

  it('returns the full synthetic list when the query is empty', async () => {
    const gateway = new NoopPrescribingGateway();
    const results = await gateway.searchMedication('');
    expect(results.length).toBeGreaterThan(1);
  });

  it('filters synthetic pharmacies by name or postal code', async () => {
    const gateway = new NoopPrescribingGateway();
    const byName = await gateway.searchPharmacy('Pharmacy #1');
    expect(byName).toHaveLength(1);
    const byZip = await gateway.searchPharmacy('62702');
    expect(byZip).toHaveLength(1);
    expect(byZip[0]?.ncpdpId).toBe('7654321');
  });

  it('returns a fixed covered formulary stub', async () => {
    const gateway = new NoopPrescribingGateway();
    const formulary = await gateway.getFormulary('308136');
    expect(formulary).toEqual({ medicationCode: '308136', covered: true, tier: 2, priorAuthRequired: false, notes: null });
  });

  it('accepts a prescription submission synchronously', async () => {
    const gateway = new NoopPrescribingGateway();
    const receipt = await gateway.sendPrescription({
      prescriptionId: 'rx-1',
      patientName: 'Test Patient',
      medicationName: 'Amoxicillin 500 MG Oral Capsule',
      rxnormCode: '308136',
      quantity: '30 capsules',
      daysSupply: 10,
      refillsAuthorized: 0,
      directions: 'Take 1 capsule by mouth three times daily',
      pharmacyNcpdpId: '1234567',
      isControlledSubstance: false,
      deaSchedule: null,
    });
    expect(receipt.status).toBe('accepted');
    expect(receipt.externalId).toMatch(/^noop-rx-/);
  });

  it('resolves cancelPrescription and refillResponse without throwing', async () => {
    const gateway = new NoopPrescribingGateway();
    await expect(gateway.cancelPrescription('noop-rx-1')).resolves.toBeUndefined();
    await expect(gateway.refillResponse({ externalId: 'noop-rx-1', approved: true, deniedReason: null })).resolves.toBeUndefined();
  });
});
