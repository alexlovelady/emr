import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_COOKIE_OPTIONS } from './session';
import type { ProblemDetails } from './types';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';

export class BackendError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: ProblemDetails | undefined,
  ) {
    super(problem?.title ?? `Backend request failed with status ${status}`);
  }
}

/** Thrown when the caller has no usable session at all (no token, or refresh also failed). */
export class SessionExpiredError extends Error {}

async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const res = await fetch(`${API_INTERNAL_URL}/api/v1/portal/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  return body;
}

interface CallOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

/**
 * The single server-side fetch to apps/api, used by every Server Component/Server Action in this
 * app. Retries once on 403 by refreshing the portal token pair — same defense-in-depth pattern as
 * clinician-web's callBackend(), against the portal auth routes instead of staff's.
 */
export async function callBackend<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) throw new SessionExpiredError('No access token cookie present');

  const doFetch = async (token: string) => {
    const url = new URL(path, API_INTERNAL_URL);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      cache: 'no-store',
    });
  };

  let res = await doFetch(accessToken);

  if (res.status === 403) {
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    if (!refreshToken) throw new SessionExpiredError('No refresh token cookie present');
    const refreshed = await refreshTokens(refreshToken);
    if (!refreshed) throw new SessionExpiredError('Refresh token rejected');
    try {
      // Server Components can't set cookies (Next.js restriction) — best-effort only here;
      // middleware's proactive refresh is the reliable persistence path for those callers.
      cookieStore.set(ACCESS_TOKEN_COOKIE, refreshed.accessToken, SESSION_COOKIE_OPTIONS);
      cookieStore.set(REFRESH_TOKEN_COOKIE, refreshed.refreshToken, SESSION_COOKIE_OPTIONS);
    } catch {
      // ignore — see above
    }
    res = await doFetch(refreshed.accessToken);
  }

  if (!res.ok) {
    let problem: ProblemDetails | undefined;
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      problem = undefined;
    }
    throw new BackendError(res.status, problem);
  }

  // Not every no-content NestJS handler sets @HttpCode(204) — a Promise<void> handler with the
  // default POST status (201) also sends an empty body, and res.json() throws "Unexpected end of
  // JSON input" on an empty string. Check the actual body instead of trusting the status code.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Like callBackend(), but returns `fallback` on a 404 instead of throwing — every portal-scoped
 * resource's "access denied" response IS a 404 by design (ConsentService.assertAccess never reveals
 * whether a patient exists vs. isn't accessible), so a page with several parallel fetches across
 * chart sections shouldn't crash if one section's grant is somehow narrower than another's.
 */
export async function callBackendOr<T>(path: string, fallback: T, opts: CallOptions = {}): Promise<T> {
  try {
    return await callBackend<T>(path, opts);
  } catch (err) {
    if (err instanceof BackendError && err.status === 404) return fallback;
    throw err;
  }
}
