'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createDiagnosticReport } from '@/lib/actions/results';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

interface ResultRow {
  code: string;
  display: string;
  valueText: string;
  unit: string;
}

const EMPTY_ROW: ResultRow = { code: '', display: '', valueText: '', unit: '' };

export function RecordResultDialog({ encounterId, patientId }: { encounterId: string; patientId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ResultRow[]>([{ ...EMPTY_ROW }]);
  const action = createDiagnosticReport.bind(null, patientId);
  const [state, formAction, isPending] = useActionState(action, null);

  useCloseOnSuccess(state, () => {
    setOpen(false);
    setRows([{ ...EMPTY_ROW }]);
  });

  function updateRow(i: number, patch: Partial<ResultRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Record result
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record diagnostic result</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="encounterId" value={encounterId} />
          <input type="hidden" name="resultsJson" value={JSON.stringify(rows.filter((r) => r.code && r.display))} />
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Report name</Label>
            <Input id="displayName" name="displayName" placeholder="Complete Blood Count" required />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="abnormalFlag" className="h-4 w-4 rounded border-input" /> Abnormal
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="criticalFlag" className="h-4 w-4 rounded border-input" /> Critical
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conclusion">Conclusion (optional)</Label>
            <Input id="conclusion" name="conclusion" />
          </div>
          <div className="space-y-2">
            <Label>Result values</Label>
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-2">
                <Input placeholder="Code" value={row.code} onChange={(e) => updateRow(i, { code: e.target.value })} />
                <Input placeholder="Display" value={row.display} onChange={(e) => updateRow(i, { display: e.target.value })} />
                <Input placeholder="Value" value={row.valueText} onChange={(e) => updateRow(i, { valueText: e.target.value })} />
                <Input placeholder="Unit" className="w-20" value={row.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                  disabled={rows.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((r) => [...r, { ...EMPTY_ROW }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add row
            </Button>
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Recording…' : 'Record result'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
