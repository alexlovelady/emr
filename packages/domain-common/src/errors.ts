/**
 * Domain-level error taxonomy. apps/api's global ProblemDetailsFilter maps each of these to an
 * RFC7807 problem+json response — domain/application code should throw these instead of
 * framework-specific HTTP exceptions, so domain logic stays framework-agnostic (spec §4:
 * "cross-domain access occurs through application interfaces... not arbitrary imports").
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly problemType: string;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;
  readonly problemType = 'https://docs.ehr.internal/problems/not-found';
}

/**
 * Thrown by the authz layer. apps/api deliberately maps this to 404 (not 403) on read paths
 * where a resource's existence across tenants must not be leaked — see PolicyEngine and
 * EHR_BUILD_SPEC.md §18.2's "guessed UUID" tenant-isolation test. Call sites that *should*
 * reveal "exists but forbidden" (e.g. permission denied within the same tenant) may map this to
 * 403 explicitly; the default mapping is the safer one.
 */
export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;
  readonly problemType = 'https://docs.ehr.internal/problems/forbidden';
}

/** Failed authentication — wrong password, unknown user, an expired/invalid MFA code, etc. */
export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;
  readonly problemType = 'https://docs.ehr.internal/problems/unauthorized';
}

export class ConflictError extends DomainError {
  readonly httpStatus = 409;
  readonly problemType: string = 'https://docs.ehr.internal/problems/conflict';
}

/** Optimistic-concurrency failure (version/If-Match mismatch) — a specific kind of conflict. */
export class ConcurrencyError extends ConflictError {
  override readonly problemType = 'https://docs.ehr.internal/problems/concurrency-conflict';
}

export class ValidationError extends DomainError {
  readonly httpStatus = 422;
  readonly problemType = 'https://docs.ehr.internal/problems/validation-error';
}

export class IdempotencyConflictError extends DomainError {
  readonly httpStatus = 409;
  readonly problemType = 'https://docs.ehr.internal/problems/idempotency-conflict';
}

/** A real 429 — previously this threw a plain `Error` from `packages/ai-adapter` that
 * `ProblemDetailsFilter` couldn't classify, so it fell through to a generic 500. */
export class RateLimitExceededError extends DomainError {
  readonly httpStatus = 429;
  readonly problemType = 'https://docs.ehr.internal/problems/rate-limit-exceeded';
}
