import { redirect } from 'next/navigation';
import { callBackend, SessionExpiredError } from '@/lib/api-proxy';
import { LeftNav } from '@/components/nav/left-nav';
import type { CurrentUser } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: CurrentUser;
  try {
    user = await callBackend<CurrentUser>('/api/v1/auth/me');
  } catch (err) {
    if (err instanceof SessionExpiredError) redirect('/login');
    throw err;
  }

  return (
    <div className="flex">
      <LeftNav user={user} />
      <main className="min-h-screen flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
