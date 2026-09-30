'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createGenomicReport } from '@/lib/actions/genomics';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

interface FindingRow {
  geneSymbol: string;
  hgvsNotation: string;
  clinicalSignificance: string;
  phenotypeCategory: string;
  interpretation: string;
}

const NO_SIGNIFICANCE = 'none';
const EMPTY_ROW: FindingRow = { geneSymbol: '', hgvsNotation: '', clinicalSignificance: NO_SIGNIFICANCE, phenotypeCategory: '', interpretation: '' };

export function RecordGenomicResultDialog({ encounterId, patientId }: { encounterId: string; patientId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FindingRow[]>([{ ...EMPTY_ROW }]);
  const action = createGenomicReport.bind(null, patientId);
  const [state, formAction, isPending] = useActionState(action, null);

  useCloseOnSuccess(state, () => {
    setOpen(false);
    setRows([{ ...EMPTY_ROW }]);
  });

  function updateRow(i: number, patch: Partial<FindingRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  const findingsPayload = rows
    .filter((r) => r.geneSymbol)
    .map((r) => ({
      geneSymbol: r.geneSymbol,
      hgvsNotation: r.hgvsNotation || undefined,
      clinicalSignificance: r.clinicalSignificance === NO_SIGNIFICANCE ? undefined : r.clinicalSignificance,
      phenotypeCategory: r.phenotypeCategory || undefined,
      interpretation: r.interpretation || undefined,
    }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> Record genomic result
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record genomic test result</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <input type="hidden" name="encounterId" value={encounterId} />
          <input type="hidden" name="findingsJson" value={JSON.stringify(findingsPayload)} />
          <div className="space-y-1.5">
            <Label htmlFor="genomicDisplayName">Panel / test name</Label>
            <Input id="genomicDisplayName" name="displayName" placeholder="Pharmacogenomic Panel" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="genomicConclusion">Conclusion (optional)</Label>
            <Input id="genomicConclusion" name="conclusion" />
          </div>
          <div className="space-y-3">
            <Label>Findings</Label>
            {rows.map((row, i) => (
              <div key={i} className="space-y-2 rounded-md border border-border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Gene symbol (e.g. CYP2D6)" value={row.geneSymbol} onChange={(e) => updateRow(i, { geneSymbol: e.target.value })} />
                  <Input placeholder="HGVS notation (optional)" value={row.hgvsNotation} onChange={(e) => updateRow(i, { hgvsNotation: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={row.clinicalSignificance} onValueChange={(v) => updateRow(i, { clinicalSignificance: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SIGNIFICANCE}>No clinical significance classified</SelectItem>
                      <SelectItem value="pathogenic">Pathogenic</SelectItem>
                      <SelectItem value="likely_pathogenic">Likely pathogenic</SelectItem>
                      <SelectItem value="uncertain_significance">Uncertain significance</SelectItem>
                      <SelectItem value="likely_benign">Likely benign</SelectItem>
                      <SelectItem value="benign">Benign</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Phenotype category (e.g. poor metabolizer)"
                    value={row.phenotypeCategory}
                    onChange={(e) => updateRow(i, { phenotypeCategory: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Interpretation (optional)"
                  value={row.interpretation}
                  onChange={(e) => updateRow(i, { interpretation: e.target.value })}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setRows((r) => [...r, { ...EMPTY_ROW }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add finding
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
