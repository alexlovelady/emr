import { z } from 'zod';

/** Item 25 — defaults to the original JSON dump, so every existing caller (no `format` query
 * param at all) is unaffected. */
export const ExportFormatSchema = z.enum(['json', 'pdf', 'ccd-xml']).default('json');
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
