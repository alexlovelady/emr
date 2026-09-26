import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ValidationError } from '@ehr/domain-common';

/**
 * "Validation: Zod at external boundaries" (spec §2.1). Lives here (not in apps/api) so every
 * domain's controllers (domains/tenant, domains/workforce, domains/documents) can use the same
 * pipe without depending on apps/api — only apps/api depends on the domains, never the reverse.
 * Throws domain-common's ValidationError (-> 422 via apps/api's ProblemDetailsFilter).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError('Request validation failed', { issues: result.error.issues });
    }
    return result.data;
  }
}
