'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { decideSmartAuthorization } from '@/lib/actions/smart-launch';
import type { PortalAccessiblePatient, SmartClientInfo } from '@/lib/types';

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'patient/Patient.read': 'Your basic demographic information',
  'patient/Observation.read': 'Your lab results and vital signs',
  'patient/Encounter.read': 'Your visit history',
  'patient/Condition.read': 'Your health conditions',
  'patient/AllergyIntolerance.read': 'Your allergies',
  'patient/MedicationRequest.read': 'Your medications',
  'patient/DocumentReference.read': 'Your documents',
  'system/*.read': 'All of your clinical data',
};

export function SmartConsentForm({
  client,
  patients,
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod,
}: {
  client: SmartClientInfo;
  patients: PortalAccessiblePatient[];
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}) {
  const [patientId, setPatientId] = useState(patients[0]!.patientId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'allow' | 'deny' | null>(null);

  const requestedScopes = scope.split(' ').filter(Boolean);

  async function submit(decision: 'allow' | 'deny') {
    setSubmitting(decision);
    setError(null);
    const result = await decideSmartAuthorization({
      decision,
      clientId,
      redirectUri,
      scope,
      state,
      codeChallenge,
      codeChallengeMethod,
      patientId,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(null);
      return;
    }
    // The redirect target is the third-party app's own domain — a full navigation, not client
    // routing, is exactly what's needed here.
    window.location.href = result.data.redirectUrl;
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{client.displayName} wants to access your records</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {patients.length > 1 && (
          <div className="space-y-1">
            <label htmlFor="patientId" className="text-sm font-medium">
              Whose records?
            </label>
            <Select id="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {p.patient.givenName} {p.patient.familyName}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">This app is asking to see:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {requestedScopes.map((s) => (
              <li key={s}>{SCOPE_DESCRIPTIONS[s] ?? s}</li>
            ))}
          </ul>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={submitting !== null} onClick={() => submit('deny')}>
          {submitting === 'deny' ? 'Denying…' : 'Deny'}
        </Button>
        <Button className="flex-1" disabled={submitting !== null} onClick={() => submit('allow')}>
          {submitting === 'allow' ? 'Allowing…' : 'Allow'}
        </Button>
      </CardFooter>
    </Card>
  );
}
