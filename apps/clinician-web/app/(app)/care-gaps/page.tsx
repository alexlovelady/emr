import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { CareGapsTable } from '@/components/care-gaps/care-gaps-table';
import type { CareGapWorklistItem } from '@/lib/types';

export default async function CareGapsPage() {
  const items = await callBackend<CareGapWorklistItem[]>('/api/v1/care-gaps');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Care gaps</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} open gap(s) — simplified engineering proxies for common quality measures, not certified HEDIS/NCQA
          specifications. Resolve once reviewed or actioned.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <CareGapsTable items={items} />
        </CardContent>
      </Card>
    </div>
  );
}
