'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaPendingToken, setMfaPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug, email, password }),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        setError(body?.title ?? 'Login failed. Check your credentials.');
        return;
      }
      if (body?.mfaRequired) {
        setMfaPendingToken(body.mfaPendingToken);
        return;
      }
      router.push('/patients');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitMfaCode(e: FormEvent) {
    e.preventDefault();
    if (!mfaPendingToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/mfa-challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mfaPendingToken, code }),
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        setError(problem?.title ?? 'Invalid or expired code.');
        return;
      }
      router.push('/patients');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mfaPendingToken ? 'Enter your authenticator code' : 'Sign in'}</CardTitle>
        </CardHeader>
        <CardContent>
          {mfaPendingToken ? (
            <form onSubmit={onSubmitMfaCode} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="code" className="text-sm font-medium">
                  6-digit code
                </label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Verifying…' : 'Verify'}
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitCredentials} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="tenantSlug" className="text-sm font-medium">
                  Organization
                </label>
                <Input id="tenantSlug" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} required autoFocus />
              </div>
              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
