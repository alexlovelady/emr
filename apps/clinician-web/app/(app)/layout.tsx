import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { callBackend, SessionExpiredError } from '@/lib/api-proxy';
import { LeftNav } from '@/components/nav/left-nav';
import { GlobalSearch } from '@/components/nav/global-search';
import { PermissionsProvider } from '@/components/providers/permissions-provider';
import type { CurrentUser, EffectivePermissions } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: CurrentUser;
  let effectivePermissions: EffectivePermissions;
  try {
    [user, effectivePermissions] = await Promise.all([
      callBackend<CurrentUser>('/api/v1/auth/me'),
      callBackend<EffectivePermissions>('/api/v1/auth/permissions'),
    ]);
  } catch (err) {
    if (err instanceof SessionExpiredError) redirect('/login');
    throw err;
  }

  return (
    <PermissionsProvider permissions={effectivePermissions.permissions}>
      <div className="flex">
        <LeftNav user={user} />
        <main className="h-screen flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <div className="mb-6 flex justify-end">
              <GlobalSearch />
            </div>
            {children}
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors />
    </PermissionsProvider>
  );
}
