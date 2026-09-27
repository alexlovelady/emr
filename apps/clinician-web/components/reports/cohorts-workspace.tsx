'use client';

import { useState } from 'react';
import { CohortBuilder } from '@/components/reports/cohort-builder';
import { CohortExecutionResult } from '@/components/reports/cohort-execution-result';
import type { CohortExecutionRow } from '@/lib/types';

export function CohortsWorkspace() {
  const [execution, setExecution] = useState<CohortExecutionRow | null>(null);

  return (
    <div className="space-y-4">
      <CohortBuilder onExecuted={setExecution} />
      {execution && <CohortExecutionResult execution={execution} />}
    </div>
  );
}
