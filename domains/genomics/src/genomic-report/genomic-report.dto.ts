import { z } from 'zod';

/** No enum for `phenotypeCategory` — CPIC-style phenotype categories differ per gene (e.g. CYP2D6's
 * "poor/intermediate/normal/rapid/ultrarapid metabolizer" vs. VKORC1's dosing-sensitivity
 * categories) and this repo has no existing HGVS/ClinVar/PharmGKB code-system precedent to
 * constrain against yet — same loose-free-text posture as `diagnostic_reports.code_system`/`code`. */
export const GenomicFindingSchema = z.object({
  geneSymbol: z.string().min(1).max(50),
  hgvsNotation: z.string().max(300).nullish(),
  variantDisplay: z.string().max(300).nullish(),
  clinicalSignificance: z
    .enum(['pathogenic', 'likely_pathogenic', 'uncertain_significance', 'likely_benign', 'benign'])
    .nullish(),
  phenotypeCategory: z.string().max(100).nullish(),
  interpretation: z.string().max(2000).nullish(),
});
export type GenomicFindingInput = z.infer<typeof GenomicFindingSchema>;

export const CreateGenomicReportSchema = z.object({
  encounterId: z.string().uuid(),
  orderId: z.string().uuid().nullish(),
  codeSystem: z.string().max(50).nullish(),
  code: z.string().max(50).nullish(),
  displayName: z.string().min(1).max(300),
  conclusion: z.string().max(2000).nullish(),
  performingLab: z.string().max(300).nullish(),
  findings: z.array(GenomicFindingSchema).min(1),
});
export type CreateGenomicReportInput = z.infer<typeof CreateGenomicReportSchema>;

export const ReviewGenomicReportSchema = z.object({
  reviewStatus: z.enum(['reviewed', 'acknowledged']),
});
export type ReviewGenomicReportInput = z.infer<typeof ReviewGenomicReportSchema>;
