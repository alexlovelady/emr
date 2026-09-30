'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createSmartClient } from '@/lib/actions/smart-clients';
import type { SmartClientCreateResult } from '@/lib/types';

const EMPTY = {
  displayName: '',
  description: '',
  developerName: '',
  websiteUrl: '',
  logoUrl: '',
  allowedScopes: 'patient/*.read',
  redirectUris: '',
  clientType: 'confidential' as 'confidential' | 'public',
  launchUri: '',
};

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function NewSmartClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<SmartClientCreateResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const allowedScopes = splitList(form.allowedScopes);
    if (allowedScopes.length === 0) {
      setError('At least one scope is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createSmartClient({ ...form, allowedScopes, redirectUris: splitList(form.redirectUris) });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated(result.data);
    router.refresh();
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm(EMPTY);
      setError(null);
      setCreated(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Register app
        </Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{created.displayName} registered</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Alert>This client secret is shown once and cannot be retrieved again — copy it now.</Alert>
              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.clientId} className="font-mono text-xs" />
                  <CopyButton value={created.clientId} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Client secret</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.clientSecret} className="font-mono text-xs" />
                  <CopyButton value={created.clientSecret} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Register a SMART app</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="scDisplayName">App name</Label>
                <Input
                  id="scDisplayName"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scDescription">Description (optional)</Label>
                <Textarea
                  id="scDescription"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scDeveloperName">Developer (optional)</Label>
                  <Input
                    id="scDeveloperName"
                    value={form.developerName}
                    onChange={(e) => setForm((f) => ({ ...f, developerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scWebsiteUrl">Website (optional)</Label>
                  <Input
                    id="scWebsiteUrl"
                    type="url"
                    value={form.websiteUrl}
                    onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
                    placeholder="https://"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scLogoUrl">Logo URL (optional)</Label>
                <Input
                  id="scLogoUrl"
                  type="url"
                  value={form.logoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scClientType">Client type</Label>
                <Select value={form.clientType} onValueChange={(v) => setForm((f) => ({ ...f, clientType: v as 'confidential' | 'public' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidential">Confidential (server-side app)</SelectItem>
                    <SelectItem value="public">Public (SPA/mobile with PKCE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scScopes">Requested scopes (comma-separated)</Label>
                <Input
                  id="scScopes"
                  value={form.allowedScopes}
                  onChange={(e) => setForm((f) => ({ ...f, allowedScopes: e.target.value }))}
                  placeholder="patient/*.read, launch/patient"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scRedirectUris">Redirect URIs (comma-separated, optional)</Label>
                <Input
                  id="scRedirectUris"
                  value={form.redirectUris}
                  onChange={(e) => setForm((f) => ({ ...f, redirectUris: e.target.value }))}
                  placeholder="https://app.example.com/callback"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scLaunchUri">EHR launch URL (optional — enables in-chart launch)</Label>
                <Input
                  id="scLaunchUri"
                  type="url"
                  value={form.launchUri}
                  onChange={(e) => setForm((f) => ({ ...f, launchUri: e.target.value }))}
                  placeholder="https://"
                />
              </div>
              {error && <Alert variant="destructive">{error}</Alert>}
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Registering…' : 'Register app'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser — the value is still visible/selectable in the input.
    }
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={onCopy}>
      <Copy className="h-3.5 w-3.5" />
      {copied ? 'Copied' : ''}
    </Button>
  );
}
