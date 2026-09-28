'use server';

import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { SmartClientInfo } from '@/lib/types';

export interface SmartAuthorizeDecisionInput {
  decision: 'allow' | 'deny';
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  patientId: string;
}

export async function getSmartClientInfo(clientId: string): Promise<ActionResult<SmartClientInfo>> {
  return runAction(() => callBackend<SmartClientInfo>('/api/v1/portal/smart/client-info', { query: { clientId } }));
}

export async function decideSmartAuthorization(input: SmartAuthorizeDecisionInput): Promise<ActionResult<{ redirectUrl: string }>> {
  return runAction(() => callBackend<{ redirectUrl: string }>('/api/v1/portal/smart/authorize-decision', { method: 'POST', body: input }));
}
