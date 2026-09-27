'use client';

import { useActionState, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { startMfaEnrollment, confirmMfaEnrollment } from '@/lib/actions/mfa';

export function MfaEnroll({ mfaEnrolled }: { mfaEnrolled: boolean }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();
  const [confirmState, confirmAction, isConfirming] = useActionState(confirmMfaEnrollment, null);
  const enrolled = mfaEnrolled || confirmState?.ok === true;

  function onStartEnrollment() {
    setStartError(null);
    startTransition(async () => {
      const result = await startMfaEnrollment();
      if (!result.ok) {
        setStartError(result.error);
        return;
      }
      setSecret(result.data.secret);
      setQrDataUrl(await QRCode.toDataURL(result.data.otpauthUrl));
    });
  }

  if (enrolled) {
    return (
      <Alert>
        <ShieldCheck className="mr-2 inline h-4 w-4" />
        Two-factor authentication is enabled on your account.
      </Alert>
    );
  }

  if (!qrDataUrl) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add an authenticator app (Google Authenticator, 1Password, Authy) as a second sign-in step.
        </p>
        {startError && <Alert variant="destructive">{startError}</Alert>}
        <Button onClick={onStartEnrollment} disabled={isStarting}>
          {isStarting ? 'Generating…' : 'Set up two-factor authentication'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- locally generated data: URI, not an optimizable remote image */}
      <img src={qrDataUrl} alt="MFA enrollment QR code" className="h-48 w-48 rounded-md border" />
      <p className="text-xs text-muted-foreground">
        Can’t scan it? Enter this key manually: <code className="rounded bg-muted px-1 py-0.5">{secret}</code>
      </p>
      <form action={confirmAction} className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="code">6-digit code</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus className="w-32" />
        </div>
        <Button type="submit" disabled={isConfirming}>
          {isConfirming ? 'Verifying…' : 'Confirm'}
        </Button>
      </form>
      {confirmState && !confirmState.ok && <Alert variant="destructive">{confirmState.error}</Alert>}
    </div>
  );
}
