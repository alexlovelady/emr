import { describe, expect, it } from 'vitest';
import { NotFoundError, ForbiddenError, ConcurrencyError } from './errors.js';

describe('DomainError taxonomy', () => {
  it('NotFoundError maps to 404', () => {
    const err = new NotFoundError('Location not found', { locationId: 'abc' });
    expect(err.httpStatus).toBe(404);
    expect(err.details).toEqual({ locationId: 'abc' });
    expect(err.name).toBe('NotFoundError');
  });

  it('ForbiddenError maps to 403', () => {
    expect(new ForbiddenError('nope').httpStatus).toBe(403);
  });

  it('ConcurrencyError is a Conflict with its own problem type', () => {
    const err = new ConcurrencyError('version mismatch');
    expect(err.httpStatus).toBe(409);
    expect(err.problemType).toContain('concurrency-conflict');
  });
});
