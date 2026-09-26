import { describe, expect, it } from 'vitest';
import { getCurrentTransaction, hasCurrentTransaction } from './request-transaction.js';

describe('request-transaction', () => {
  it('hasCurrentTransaction() is false outside runWithRequestTransaction', () => {
    expect(hasCurrentTransaction()).toBe(false);
  });

  it('getCurrentTransaction() throws outside runWithRequestTransaction', () => {
    expect(() => getCurrentTransaction()).toThrow(/runWithRequestTransaction/);
  });
});
