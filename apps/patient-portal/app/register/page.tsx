'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

export default function RegisterPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [patientId, setPatientId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug, email, password, patientId, dateOfBirth }),
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        setError(problem?.title ?? 'We could not verify your identity. Check your details and try again.');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your patient portal account</CardTitle>
          <CardDescription>
            We verify your identity using the patient record id and date of birth your practice gave you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenantSlug">Practice code</Label>
              <Input id="tenantSlug" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="patientId">Patient record id</Label>
              <Input id="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
