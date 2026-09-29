'use server';

import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';

/** Item 24 — mints an EHR-launch context for `clientId` scoped to `patientId` and returns the URL
 * to send the browser to (the app's own registered `launch_uri`, carrying `iss`/`launch`). The
 * caller navigates there directly (`window.location.href`) rather than via Next's `redirect()`,
 * since this is a cross-origin hop to a third-party app, not an in-app route. */
export async function launchSmartApp(patientId: string, clientId: string): Promise<ActionResult<{ launchUrl: string }>> {
  return runAction(() => callBackend<{ launchUrl: string }>(`/api/v1/patients/${patientId}/smart-launch`, { method: 'POST', body: { clientId } }));
}
