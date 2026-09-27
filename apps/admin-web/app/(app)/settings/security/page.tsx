import { callBackend } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MfaEnroll } from '@/components/settings/mfa-enroll';
import type { CurrentUser } from '@/lib/types';

export default async function SecuritySettingsPage() {
  const user = await callBackend<CurrentUser>('/api/v1/auth/me');

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <MfaEnroll mfaEnrolled={user.mfaEnrolled} />
        </CardContent>
      </Card>
    </div>
  );
}
