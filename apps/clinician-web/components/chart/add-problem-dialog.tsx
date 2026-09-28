'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Typeahead } from '@/components/ui/typeahead';
import { useTerminologySearch, type ConceptMatch } from '@/lib/use-terminology-search';
import { createProblem } from '@/lib/actions/problems';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

const CODE_SYSTEM = 'ICD-10';

export function AddProblemDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [conditionQuery, setConditionQuery] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [state, formAction, isPending] = useActionState(createProblem, null);

  const conditions = useTerminologySearch(CODE_SYSTEM, conditionQuery);

  // Doesn't auto-close when the code was actually checked and came back unrecognized — the
  // clinician should see that notice, not have the dialog vanish out from under it, same pattern
  // as the prescribe dialog's interaction-findings check.
  useCloseOnSuccess(state, () => {
    const validation = state?.ok ? state.data.codeValidation : null;
    if (!validation || validation.valid || !validation.checked) setOpen(false);
  });

  function selectCondition(match: ConceptMatch): void {
    setConditionQuery(match.display);
    setDisplayName(match.display);
    setCode(match.code);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Add problem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add problem</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <div className="space-y-1.5">
            <Label>Search by condition name</Label>
            <Typeahead
              query={conditionQuery}
              onQueryChange={setConditionQuery}
              results={conditions}
              renderLabel={(c) => `${c.display} (${c.code})`}
              onSelect={selectCondition}
              placeholder="Type 2 diabetes"
            />
            <p className="text-xs text-muted-foreground">
              Selecting a result fills in the fields below — you can still edit them, or type a code directly if it isn&apos;t found.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Problem</Label>
            <Input
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Type 2 diabetes"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="codeSystem">Code system</Label>
              <Input id="codeSystem" name="codeSystem" defaultValue={CODE_SYSTEM} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="E11.9" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onsetDate">Onset date (optional)</Label>
            <Input id="onsetDate" name="onsetDate" type="date" />
          </div>
          {state && state.ok && state.data.codeValidation && !state.data.codeValidation.valid && state.data.codeValidation.checked && (
            <Alert>Code not recognized in {CODE_SYSTEM} — recorded anyway, since this may be a real code not yet loaded locally.</Alert>
          )}
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add problem'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
