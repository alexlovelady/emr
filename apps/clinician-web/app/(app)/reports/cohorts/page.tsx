import Link from 'next/link';
import { Users2 } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/chart/empty-state';
import { CohortsWorkspace } from '@/components/reports/cohorts-workspace';
import type { CohortRow } from '@/lib/types';

export default async function CohortsPage() {
  const cohorts = await callBackend<CohortRow[]>('/api/v1/cohorts');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cohorts</h1>
        <p className="text-sm text-muted-foreground">Build a patient cohort from problems, allergies, medications, age, or lab measures.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved cohorts</CardTitle>
        </CardHeader>
        <CardContent>
          {cohorts.length === 0 ? (
            <EmptyState icon={Users2} message="No saved cohorts yet." />
          ) : (
            <ul className="divide-y divide-border">
              {cohorts.map((c) => (
                <li key={c.id} className="py-2.5 text-sm">
                  <Link href={`/reports/cohorts/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New cohort</CardTitle>
        </CardHeader>
        <CardContent>
          <CohortsWorkspace />
        </CardContent>
      </Card>
    </div>
  );
}
