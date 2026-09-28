'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { usePharmacySearch } from '@/components/prescriptions/use-erx-search';
import { useTerminologySearch, type ConceptMatch } from '@/lib/use-terminology-search';
import { Typeahead } from '@/components/ui/typeahead';
import { createPrescription } from '@/lib/actions/prescriptions';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

const RXNORM_SYSTEM = 'RxNorm';

export function PrescribeDialog({ patientId }: { patientId: string }) {
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);
  const [medicationQuery, setMedicationQuery] = useState('');
  const [pharmacyQuery, setPharmacyQuery] = useState('');
  const [pharmacyNcpdpId, setPharmacyNcpdpId] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [rxnormCode, setRxnormCode] = useState('');
  const [isControlled, setIsControlled] = useState(false);
  const [deaSchedule, setDeaSchedule] = useState('');

  const medications = useTerminologySearch(RXNORM_SYSTEM, medicationQuery);
  const pharmacies = usePharmacySearch(pharmacyQuery);

  function selectMedication(m: ConceptMatch): void {
    setMedicationQuery(m.display);
    setRxnormCode(m.code);
  }

  const action = createPrescription.bind(null, patientId);
  const [state, formAction, isPending] = useActionState(action, null);

  // Doesn't auto-close when the (currently always-empty, see NoopInteractionCheckGateway)
  // interaction check ever does return findings, or when the RxNorm code was actually checked and
  // came back unrecognized — the clinician should see either, not have the dialog vanish out from
  // under a warning.
  useCloseOnSuccess(state, () => {
    if (!state?.ok) return;
    const validation = state.data.codeValidation;
    const codeIsSuspect = validation !== null && validation.checked && !validation.valid;
    if (state.data.interactionFindings.length === 0 && !codeIsSuspect) setOpen(false);
  });

  const canPrescribeControlled = has(PERMISSION_KEYS.CONTROLLED_SUBSTANCE_PRESCRIBE);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Prescribe
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prescribe medication</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="pharmacyNcpdpId" value={pharmacyNcpdpId} />
          <input type="hidden" name="pharmacyName" value={pharmacyName} />

          <div className="space-y-1.5">
            <Label htmlFor="prescriberId">Prescriber ID</Label>
            <Input id="prescriberId" name="prescriberId" placeholder="UUID" required />
          </div>

          <div className="space-y-1.5">
            <Label>Medication</Label>
            <Typeahead
              query={medicationQuery}
              onQueryChange={(q) => {
                setMedicationQuery(q);
                setRxnormCode('');
              }}
              results={medications}
              renderLabel={(m) => m.display}
              onSelect={selectMedication}
            />
            <input type="hidden" name="medicationName" value={medicationQuery} />
            <input type="hidden" name="rxnormCode" value={rxnormCode} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dose">Dose</Label>
              <Input id="dose" name="dose" placeholder="10mg" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="route">Route</Label>
              <Input id="route" name="route" placeholder="oral" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="frequency">Frequency</Label>
              <Input id="frequency" name="frequency" placeholder="daily" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="directions">Directions</Label>
            <Input id="directions" name="directions" placeholder="Take one tablet by mouth daily" required />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" name="quantity" placeholder="30" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daysSupply">Days supply</Label>
              <Input id="daysSupply" name="daysSupply" type="number" placeholder="30" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refillsAuthorized">Refills</Label>
              <Input
                id="refillsAuthorized"
                name="refillsAuthorized"
                type="number"
                defaultValue={0}
                disabled={isControlled && deaSchedule === 'II'}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Pharmacy</Label>
            <Typeahead
              query={pharmacyQuery}
              onQueryChange={setPharmacyQuery}
              results={pharmacies}
              renderLabel={(p) => `${p.name} — ${p.city}, ${p.state} ${p.postalCode}`}
              onSelect={(p) => {
                setPharmacyQuery(p.name);
                setPharmacyNcpdpId(p.ncpdpId);
                setPharmacyName(p.name);
              }}
            />
          </div>

          {canPrescribeControlled && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="isControlledSubstance"
                  className="h-4 w-4 rounded border-input"
                  checked={isControlled}
                  onChange={(e) => setIsControlled(e.target.checked)}
                />
                This is a controlled substance
              </label>
              {isControlled && (
                <div className="space-y-1.5">
                  <Label htmlFor="deaSchedule">DEA schedule</Label>
                  <Select name="deaSchedule" value={deaSchedule} onValueChange={setDeaSchedule} required>
                    <SelectTrigger id="deaSchedule">
                      <SelectValue placeholder="Select schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="II">Schedule II</SelectItem>
                      <SelectItem value="III">Schedule III</SelectItem>
                      <SelectItem value="IV">Schedule IV</SelectItem>
                      <SelectItem value="V">Schedule V</SelectItem>
                    </SelectContent>
                  </Select>
                  {deaSchedule === 'II' && (
                    <p className="text-xs text-muted-foreground">Schedule II cannot be authorized with refills.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <Alert>
            Interaction check: not available — no drug-database vendor is connected. This is not a
            real safety check.
          </Alert>
          {state && state.ok && state.data.interactionFindings.length > 0 && (
            <Alert variant="destructive">
              {state.data.interactionFindings.map((f, i) => (
                <div key={i}>{f.description}</div>
              ))}
            </Alert>
          )}
          {state && state.ok && state.data.codeValidation?.checked && !state.data.codeValidation.valid && (
            <Alert>RxNorm code not recognized — recorded anyway, since this may be a real code RxNav doesn&apos;t have.</Alert>
          )}
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send prescription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
