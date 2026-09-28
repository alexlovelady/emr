'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

/** `useSearchParams()` (for the SMART-launch `?next=` deep link, see middleware.ts) needs a
 * Suspense boundary or `next build`'s static prerendering of this page fails outright. */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug, email, password }),
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        setError(problem?.title ?? 'Sign in failed. Check your organization, email, and password.');
        return;
      }
      // Only ever a same-origin relative path — `next` is attacker-controllable via the URL bar,
      // so anything else (an absolute URL, or `//host` which browsers treat as protocol-relative)
      // is rejected rather than followed, to avoid an open-redirect after a real login.
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.push(safeNext);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to your patient portal</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="tenantSlug" className="text-sm font-medium">
                Practice code
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
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New here? <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
