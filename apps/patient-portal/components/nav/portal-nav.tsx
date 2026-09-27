'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, FileText, FolderOpen, Home, MessageSquare, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

function tabsFor(patientId: string) {
  return [
    { href: `/patients/${patientId}`, label: 'Overview', icon: Home, exact: true },
    { href: `/patients/${patientId}/appointments`, label: 'Appointments', icon: CalendarDays, exact: false },
    { href: `/patients/${patientId}/records`, label: 'Health record', icon: FileText, exact: false },
    { href: `/patients/${patientId}/documents`, label: 'Documents', icon: FolderOpen, exact: false },
    { href: `/patients/${patientId}/billing`, label: 'Billing', icon: Receipt, exact: false },
    { href: `/patients/${patientId}/messages`, label: 'Messages', icon: MessageSquare, exact: false },
  ] as const;
}

export function PortalNav({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = tabsFor(patientId);

  async function onLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <nav className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <tab.icon className="h-4 w-4" strokeWidth={2} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <button onClick={onLogout} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        Sign out
      </button>
    </div>
  );
}
