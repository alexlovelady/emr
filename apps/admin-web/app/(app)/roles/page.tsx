import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { NewRoleDialog } from '@/components/roles/new-role-dialog';
import { RolesList } from '@/components/roles/roles-list';
import type { RoleRow } from '@/lib/types';

export default async function RolesPage() {
  const roles = await callBackend<RoleRow[]>('/api/v1/roles');
  const permissionsByRole = await Promise.all(roles.map((r) => callBackend<string[]>(`/api/v1/roles/${r.id}/permissions`)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
          <p className="text-sm text-muted-foreground">{roles.length} roles</p>
        </div>
        <NewRoleDialog />
      </div>
      <Card>
        <CardContent className="pt-6">
          <RolesList roles={roles} permissionsByRole={permissionsByRole} />
        </CardContent>
      </Card>
    </div>
  );
}
