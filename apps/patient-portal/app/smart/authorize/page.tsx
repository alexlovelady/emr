import { callBackendOr } from '@/lib/api-proxy';
import { getSmartClientInfo } from '@/lib/actions/smart-launch';
import { SmartConsentForm } from '@/components/smart-launch/smart-consent-form';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { PortalAccessiblePatient } from '@/lib/types';

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Can&apos;t continue this sign-in request</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * SMART standalone launch's consent + patient-picker screen — the piece that was missing when
 * this flow was deferred (see the migration's own doc comment). Reached only via
 * apps/interop-fhir's `/fhir/r4/authorize`, which forwards every query param here unchanged after
 * validating the client/redirect_uri; this page trusts them only as far as the backend re-validates
 * them again in `SmartLaunchService.decide()` before ever creating a real authorization code.
 */
export default async function SmartAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const scope = params.scope ?? '';
  const state = params.state ?? null;
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method;

  if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
    return <ErrorCard message="This sign-in request is missing required parameters. Ask the app you were using to try again." />;
  }

  const [clientInfoResult, patients] = await Promise.all([
    getSmartClientInfo(clientId),
    callBackendOr<PortalAccessiblePatient[]>('/api/v1/portal/patients', []),
  ]);

  if (!clientInfoResult.ok) {
    return <ErrorCard message={clientInfoResult.error} />;
  }
  if (patients.length === 0) {
    return <ErrorCard message="This account isn't linked to any patient record yet, so there's nothing to share." />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SmartConsentForm
        client={clientInfoResult.data}
        patients={patients}
        clientId={clientId}
        redirectUri={redirectUri}
        scope={scope}
        state={state}
        codeChallenge={codeChallenge}
        codeChallengeMethod="S256"
      />
    </div>
  );
}
