'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { importBankStatement } from '@/lib/actions/bank-reconciliation';
import type { ImportBankStatementResult } from '@/lib/types';

export function ImportStatementDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportBankStatementResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRawText('');
    setError(null);
    setResult(null);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRawText(await file.text());
  }

  async function onImport() {
    if (!rawText.trim()) {
      setError('Paste a BAI2 file or choose one to upload.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    const res = await importBankStatement(rawText);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-1.5 h-4 w-4" /> Import statement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a BAI2 bank statement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            No live bank-feed connection exists — download the BAI2 export from your bank&apos;s own portal, then upload
            or paste it here.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="bai2File">Statement file</Label>
            <input
              ref={fileInputRef}
              id="bai2File"
              type="file"
              accept=".bai2,.txt,text/plain"
              onChange={onFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rawText">Or paste the raw file contents</Label>
            <Textarea
              id="rawText"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder="01,BANKID,CUSTID,260101,0800,1,,,2/..."
            />
          </div>
          {result && (
            <Alert>
              Imported {result.imported}, skipped {result.skipped} (already on file).
              {result.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button onClick={onImport} disabled={submitting}>
              {submitting ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
