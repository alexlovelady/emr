import { Grid2x2, Globe } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NewSmartClientDialog } from '@/components/smart-apps/new-smart-client-dialog';
import { SmartClientRowActions } from '@/components/smart-apps/smart-client-row-actions';
import type { SmartClientRow } from '@/lib/types';

export default async function SmartAppsPage() {
  const clients = await callBackend<SmartClientRow[]>('/api/v1/smart-clients/admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SMART apps</h1>
          <p className="text-sm text-muted-foreground">
            Third-party apps registered for this practice — a per-practice catalog, not a shared cross-tenant marketplace.
          </p>
        </div>
        <NewSmartClientDialog />
      </div>
      {clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Grid2x2 className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No SMART apps registered yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex h-full flex-col gap-3 pt-6">
                <div className="flex items-start gap-3">
                  {c.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a third-party-supplied logo URL, not a local asset
                    <img src={c.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Grid2x2 className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.displayName}</div>
                    {c.developerName && <div className="truncate text-xs text-muted-foreground">by {c.developerName}</div>}
                  </div>
                  <Badge variant={c.status === 'active' ? 'success' : 'outline'}>{c.status}</Badge>
                </div>
                {c.description && <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{c.description}</p>}
                <div className="flex flex-wrap gap-1">
                  {c.allowedScopes.map((scope) => (
                    <Badge key={scope} variant="secondary">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  {c.websiteUrl ? (
                    <a
                      href={c.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Globe className="h-3 w-3" /> Website
                    </a>
                  ) : (
                    <span />
                  )}
                  <SmartClientRowActions client={c} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
