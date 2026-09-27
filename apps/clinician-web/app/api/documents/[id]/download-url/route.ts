import { NextResponse } from 'next/server';
import { callBackend, BackendError, SessionExpiredError } from '@/lib/api-proxy';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  try {
    const { url } = await callBackend<{ url: string }>(`/api/v1/documents/${id}/download-url`);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof SessionExpiredError) return NextResponse.json({ title: 'Session expired' }, { status: 401 });
    if (err instanceof BackendError) return NextResponse.json(err.problem ?? { title: err.message }, { status: err.status });
    throw err;
  }
}
