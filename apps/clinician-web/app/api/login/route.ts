import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';

export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as { tenantSlug: string; email: string; password: string };

  const res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const problem = await res.json().catch(() => undefined);
    return NextResponse.json(problem ?? { title: 'Login failed' }, { status: res.status });
  }

  const result = (await res.json()) as
    | { mfaRequired: true; mfaPendingToken: string }
    | { mfaRequired: false; accessToken: string; refreshToken: string };

  if (result.mfaRequired) {
    return NextResponse.json({ mfaRequired: true, mfaPendingToken: result.mfaPendingToken });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, result.accessToken, SESSION_COOKIE_OPTIONS);
  cookieStore.set(REFRESH_TOKEN_COOKIE, result.refreshToken, SESSION_COOKIE_OPTIONS);

  return NextResponse.json({ mfaRequired: false });
}
