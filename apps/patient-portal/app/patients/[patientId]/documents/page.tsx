import { FolderOpen } from 'lucide-react';
import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ExportRecordsPanel } from '@/components/documents/export-records-panel';
import type { DocumentItem, ExportRequest } from '@/lib/types';

export default async function DocumentsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const [documents, exportHistory] = await Promise.all([
    callBackendOr<DocumentItem[]>(`/api/v1/portal/patients/${patientId}/documents`, []),
    callBackendOr<ExportRequest[]>(`/api/v1/portal/patients/${patientId}/export-requests`, []),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents on file</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <FolderOpen className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No documents on file.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <span>{d.filename}</span>
                  <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export my records</CardTitle>
        </CardHeader>
        <CardContent>
          <ExportRecordsPanel patientId={patientId} history={exportHistory} />
        </CardContent>
      </Card>
    </div>
  );
}
