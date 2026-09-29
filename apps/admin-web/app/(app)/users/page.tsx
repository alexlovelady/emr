import { Users } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { NewUserDialog } from '@/components/users/new-user-dialog';
import { AssignRoleDialog } from '@/components/users/assign-role-dialog';
import type { RoleRow, UserRoleGrant, UserRow } from '@/lib/types';

export default async function UsersPage() {
  const [users, roles] = await Promise.all([
    callBackend<UserRow[]>('/api/v1/users'),
    callBackend<RoleRow[]>('/api/v1/roles'),
  ]);
  const grants =
    users.length > 0
      ? await callBackend<UserRoleGrant[]>('/api/v1/users/roles/bulk', { method: 'POST', body: { userIds: users.map((u) => u.id) } })
      : [];
  const grantsByUserId = new Map<string, UserRoleGrant[]>();
  for (const grant of grants) {
    const existing = grantsByUserId.get(grant.userId);
    if (existing) existing.push(grant);
    else grantsByUserId.set(grant.userId, [grant]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">{users.length} users</p>
        </div>
        <NewUserDialog />
      </div>
      <Card>
        <CardContent className="pt-6">
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Users className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No users yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const userGrants = grantsByUserId.get(u.id) ?? [];
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        {userGrants.length === 0 ? (
                          <span className="text-xs text-muted-foreground">none</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {userGrants.map((g) => (
                              <Badge key={g.id} variant="outline">{g.roleDisplayName}</Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{u.status}</TableCell>
                      <TableCell>{u.mfaEnrolled ? 'Enrolled' : '—'}</TableCell>
                      <TableCell className="text-right">
                        <AssignRoleDialog user={u} roles={roles} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
