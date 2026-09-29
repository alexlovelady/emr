import { describe, expect, it } from 'vitest';
import { CreatePrescriptionSchema } from './prescription.dto.js';

const BASE = {
  prescriberId: '11111111-1111-1111-1111-111111111111',
  medicationName: 'Amoxicillin',
  quantity: '30',
  directions: 'Take one tablet by mouth twice daily',
  pharmacyNcpdpId: '1234567',
  pharmacyName: 'Test Pharmacy',
};

describe('CreatePrescriptionSchema — dose validation (item 19)', () => {
  it('accepts a well-formed dose', () => {
    const result = CreatePrescriptionSchema.safeParse({ ...BASE, dose: '500 mg' });
    expect(result.success).toBe(true);
  });

  it('rejects an unparseable dose', () => {
    const result = CreatePrescriptionSchema.safeParse({ ...BASE, dose: 'a lot' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('dose'))).toBe(true);
    }
  });

  it('still enforces the existing DEA schedule/controlled-substance rules alongside dose validation', () => {
    const result = CreatePrescriptionSchema.safeParse({
      ...BASE,
      dose: '500 mg',
      isControlledSubstance: true,
      deaSchedule: 'II',
      refillsAuthorized: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('refillsAuthorized'))).toBe(true);
    }
  });
});
