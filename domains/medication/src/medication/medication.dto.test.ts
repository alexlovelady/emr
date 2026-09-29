import { describe, expect, it } from 'vitest';
import { CreateMedicationSchema } from './medication.dto.js';

const BASE = {
  medicationName: 'Lisinopril',
  sourceType: 'clinician_entered' as const,
};

describe('CreateMedicationSchema — dose validation (item 19)', () => {
  it('accepts a well-formed dose', () => {
    const result = CreateMedicationSchema.safeParse({ ...BASE, dose: '10 mg' });
    expect(result.success).toBe(true);
  });

  it('accepts no dose at all', () => {
    const result = CreateMedicationSchema.safeParse({ ...BASE, dose: null });
    expect(result.success).toBe(true);
  });

  it('rejects an unparseable dose (no unit)', () => {
    const result = CreateMedicationSchema.safeParse({ ...BASE, dose: '10' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('dose'))).toBe(true);
    }
  });

  it('rejects a zero-amount dose', () => {
    const result = CreateMedicationSchema.safeParse({ ...BASE, dose: '0 mg' });
    expect(result.success).toBe(false);
  });

  it('accepts an implausibly large dose (warns, does not block at the schema layer)', () => {
    const result = CreateMedicationSchema.safeParse({ ...BASE, dose: '50000 mg' });
    expect(result.success).toBe(true);
  });
});
