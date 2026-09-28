import { z } from 'zod';
import { ValidationError } from '@ehr/domain-common';
import { BULK_EXPORT_RESOURCE_TYPES } from '@ehr/bulk-export';

export const KickOffBulkExportQuerySchema = z.object({
  _type: z
    .string()
    .optional()
    .transform((v) => v?.split(',').map((s) => s.trim()).filter(Boolean)),
  _since: z.string().datetime().optional(),
});
export type KickOffBulkExportQuery = z.infer<typeof KickOffBulkExportQuerySchema>;

export function parseRequestedResourceTypes(types: string[] | undefined): string[] | null {
  if (!types || types.length === 0) return null;
  const invalid = types.filter((t) => !(BULK_EXPORT_RESOURCE_TYPES as readonly string[]).includes(t));
  if (invalid.length > 0) {
    throw new ValidationError(`Unsupported _type value(s): ${invalid.join(', ')}`, { invalid, supported: BULK_EXPORT_RESOURCE_TYPES });
  }
  return types;
}
