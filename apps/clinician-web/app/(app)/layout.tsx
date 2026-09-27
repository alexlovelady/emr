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
      <main className="h-screen flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
