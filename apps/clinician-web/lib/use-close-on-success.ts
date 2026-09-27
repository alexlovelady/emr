import { useState } from 'react';
import type { ActionResult } from './actions/action-result';

/**
 * Closes a dialog once its bound useActionState result flips to success. Uses React's documented
 * render-time state-adjustment pattern (comparing against the previous value) instead of a
 * useEffect, since a useEffect here would just add an extra unnecessary render pass for a change
 * that's already known during this render.
 */
export function useCloseOnSuccess<T>(state: ActionResult<T> | null, onSuccess: () => void): void {
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.ok) onSuccess();
  }
}
