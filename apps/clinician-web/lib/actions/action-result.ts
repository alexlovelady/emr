import { BackendError, SessionExpiredError } from '@/lib/api-proxy';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** Wraps a callBackend()-calling Server Action body so every action returns a uniform result instead of throwing. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      return { ok: false, error: 'Your session expired. Please sign in again.', status: 401 };
    }
    if (err instanceof BackendError) {
      return { ok: false, error: err.problem?.title ?? err.message, status: err.status };
    }
    throw err;
  }
}
