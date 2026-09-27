'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { IntakeFormField, IntakeFormTemplate } from '@/lib/types';

/** Request shape — unlike IntakeFormField (the response shape), `options` must be omitted rather than sent as null when absent (the backend's Zod schema is `.optional()`, not nullable). */
type IntakeFormFieldInput = Omit<IntakeFormField, 'options'> & { options?: string[] };

export async function createIntakeTemplate(name: string, schema: IntakeFormFieldInput[]): Promise<ActionResult<IntakeFormTemplate>> {
  const result = await runAction(() =>
    callBackend<IntakeFormTemplate>('/api/v1/intake-form-templates', { method: 'POST', body: { name, schema } }),
  );
  if (result.ok) revalidatePath('/intake-templates');
  return result;
}
