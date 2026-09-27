'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ALL_PERMISSION_KEYS } from '@/lib/permission-catalog';
import { grantRolePermission, revokeRolePermission } from '@/lib/actions/roles';
import type { RoleRow } from '@/lib/types';

function RolePermissionChecklist({ roleId, permissions }: { roleId: string; permissions: string[] }) {
  const router = useRouter();
  const granted = new Set(permissions);
  const [isPending, startTransition] = useTransition();

  function toggle(permissionKey: string, checked: boolean) {
    startTransition(async () => {
      const result = checked ? await grantRolePermission(roleId, permissionKey) : await revokeRolePermission(roleId, permissionKey);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid max-h-80 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto border-t border-border bg-muted/30 p-4 text-sm">
      {ALL_PERMISSION_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 py-0.5">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-input"
            checked={granted.has(key)}
            disabled={isPending}
            onChange={(e) => toggle(key, e.target.checked)}
          />
          <span className="text-xs">{key}</span>
        </label>
      ))}
    </div>
  );
}

export function RolesList({ roles, permissionsByRole }: { roles: RoleRow[]; permissionsByRole: string[][] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border">
      {roles.map((r, i) => (
        <li key={r.id}>
          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="flex w-full items-center gap-3 py-3 text-left">
            <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.displayName}</div>
              <div className="text-xs text-muted-foreground">{r.key}</div>
            </div>
            {r.isSystem && <Badge variant="outline">system</Badge>}
            <span className="text-xs text-muted-foreground">{permissionsByRole[i]!.length} permissions</span>
            {expanded === r.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {expanded === r.id && <RolePermissionChecklist roleId={r.id} permissions={permissionsByRole[i]!} />}
        </li>
      ))}
    </ul>
  );
}
