'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { CurrentUser } from '@/lib/types';

const LINKS = [
  { href: '/patients', label: 'Patients' },
  { href: '/schedule', label: 'Schedule' },
];

export function LeftNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="flex h-screen w-56 flex-col border-r border-border bg-card px-3 py-4">
      <div className="mb-6 px-2 text-lg font-semibold tracking-tight">EHR</div>
      <div className="flex-1 space-y-1">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'block rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-muted',
              pathname.startsWith(link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <div className="truncate px-2 text-xs text-muted-foreground">{user.email}</div>
        <Button variant="outline" size="sm" className="w-full" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </nav>
  );
}
