import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_COOKIE_OPTIONS, isExpiredOrExpiringSoon } from './lib/session';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';

const PUBLIC_PATHS = ['/login', '/api/login'];

/**
 * Proactively refreshes the access token before any Server Component/Route Handler runs, since
 * Server Components cannot set cookies themselves. Redirects to /login when there's no usable
 * session at all. See docs/adr/0006-clinician-web-bff-auth.md.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!isExpiredOrExpiringSoon(accessToken)) {
    return NextResponse.next();
  }

  if (!refreshToken) {
    return redirectToLogin(req);
  }

  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return redirectToLogin(req);

    const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
    const response = NextResponse.next();
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, SESSION_COOKIE_OPTIONS);
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, SESSION_COOKIE_OPTIONS);
    return response;
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const response = NextResponse.redirect(url);
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
