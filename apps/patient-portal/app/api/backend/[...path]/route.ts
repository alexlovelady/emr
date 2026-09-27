import { NextResponse, type NextRequest } from 'next/server';
import { callBackend, BackendError, SessionExpiredError } from '@/lib/api-proxy';

/**
 * Generic proxy for client-side calls that need apps/api (Server Components call callBackend()
 * directly and skip this hop — see docs/adr/0006-clinician-web-bff-auth.md). Used by ThreadView's
 * message-list refetch after sending a reply, same as clinician-web's equivalent route.
 */
async function handle(req: NextRequest, params: { path: string[] }): Promise<NextResponse> {
  const path = `/api/v1/${params.path.join('/')}`;
  const query = Object.fromEntries(req.nextUrl.searchParams);
  const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.json().catch(() => undefined);

  try {
    const data = await callBackend(path, { method: req.method, body, query });
    return NextResponse.json(data ?? {});
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      return NextResponse.json({ title: 'Session expired' }, { status: 401 });
    }
    if (err instanceof BackendError) {
      return NextResponse.json(err.problem ?? { title: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, await ctx.params);
}
