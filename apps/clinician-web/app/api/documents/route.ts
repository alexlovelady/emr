import { NextResponse } from 'next/server';
import { callBackend, BackendError, SessionExpiredError } from '@/lib/api-proxy';
import type { DocumentItem } from '@/lib/types';

/**
 * Proxies the whole upload dance server-side: request a presigned S3 PUT URL from apps/api, PUT
 * the bytes to it from this server (not the browser — sidesteps any CORS question on the local
 * MinIO/S3 endpoint, consistent with this app's BFF-everywhere design), then confirm. The browser
 * only ever talks to this same-origin route with a plain multipart form.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ title: 'No file provided' }, { status: 400 });
  }
  const patientId = form.get('patientId');
  const documentCategory = form.get('documentCategory');

  try {
    const { document, uploadUrl } = await callBackend<{ document: DocumentItem; uploadUrl: string }>('/api/v1/documents', {
      method: 'POST',
      body: {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        ...(patientId ? { patientId: String(patientId) } : {}),
        ...(documentCategory ? { documentCategory: String(documentCategory) } : {}),
      },
    });

    let putRes: Response;
    try {
      putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: Buffer.from(await file.arrayBuffer()),
      });
    } catch {
      // Network-level failure reaching the object-storage endpoint (e.g. no MinIO running in
      // this dev environment) — distinct from an HTTP error response from a reachable storage.
      return NextResponse.json({ title: 'Could not reach object storage' }, { status: 502 });
    }
    if (!putRes.ok) {
      return NextResponse.json({ title: `Upload to storage failed (${putRes.status})` }, { status: 502 });
    }

    const confirmed = await callBackend<DocumentItem>(`/api/v1/documents/${document.id}/confirm`, { method: 'POST', body: {} });
    return NextResponse.json(confirmed);
  } catch (err) {
    if (err instanceof SessionExpiredError) return NextResponse.json({ title: 'Session expired' }, { status: 401 });
    if (err instanceof BackendError) return NextResponse.json(err.problem ?? { title: err.message }, { status: err.status });
    throw err;
  }
}
