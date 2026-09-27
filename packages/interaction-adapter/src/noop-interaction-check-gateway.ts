import type { InteractionCheckGateway, InteractionCheckInput, InteractionFinding } from './interaction-check-gateway.js';

/**
 * No licensed drug-interaction/drug-allergy database is connected in this environment. This
 * ALWAYS returns an empty findings list, regardless of input — it never actually checks anything.
 *
 * This must never be presented to a clinician as a real safety check having run. The prescribing
 * UI (`apps/clinician-web`'s prescribe dialog) shows a persistent, unconditional notice — "not
 * available, no drug-database vendor connected" — precisely so an empty findings list here reads
 * as "no check happened" rather than "checked, and it's clear." Do not remove or soften that
 * notice without first replacing this class with a real, licensed `InteractionCheckGateway`
 * implementation.
 */
export class NoopInteractionCheckGateway implements InteractionCheckGateway {
  async checkInteractions(_input: InteractionCheckInput): Promise<InteractionFinding[]> {
    return [];
  }
}
