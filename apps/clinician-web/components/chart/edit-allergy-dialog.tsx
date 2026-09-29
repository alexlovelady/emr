'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { updateAllergy } from '@/lib/actions/allergies';
import type { Allergy } from '@/lib/types';

export function EditAllergyDialog({ allergy, patientId }: { allergy: Allergy; patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reaction, setReaction] = useState(allergy.reaction ?? '');
  const [severity, setSeverity] = useState(allergy.severity ?? '');
  const [onsetDate, setOnsetDate] = useState(allergy.onsetDate ?? '');
  const [notes, setNotes] = useState(allergy.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updateAllergy(allergy.id, patientId, { reaction, severity, onsetDate, notes });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {allergy.substance} allergy</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="editReaction">Reaction</Label>
            <Input id="editReaction" value={reaction} onChange={(e) => setReaction(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editSeverity">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger id="editSeverity">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editOnsetDate">Onset date</Label>
            <Input id="editOnsetDate" type="date" value={onsetDate} onChange={(e) => setOnsetDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editNotes">Notes</Label>
            <Textarea id="editNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
