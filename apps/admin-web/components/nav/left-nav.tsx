'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Boxes, Building2, LogOut, MapPin, Settings, ShieldCheck, Stethoscope, Users, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { CurrentUser } from '@/lib/types';

const LINKS = [
  { href: '/organizations', label: 'Organizations', icon: Building2, permission: PERMISSION_KEYS.ORGANIZATION_MANAGE },
  { href: '/locations', label: 'Locations', icon: MapPin, permission: PERMISSION_KEYS.LOCATION_MANAGE },
  { href: '/practitioners', label: 'Practitioners', icon: Stethoscope, permission: PERMISSION_KEYS.PRACTITIONER_MANAGE },
  { href: '/resources', label: 'Resources', icon: Boxes, permission: PERMISSION_KEYS.APPOINTMENT_MANAGE },
  { href: '/users', label: 'Users', icon: Users, permission: PERMISSION_KEYS.USER_MANAGE },
  { href: '/roles', label: 'Roles', icon: KeyRound, permission: PERMISSION_KEYS.ROLE_MANAGE },
] as const;

function initials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? [parts[0]?.[0], parts[1]?.[0]] : [name[0], name[1]];
  return chars.filter(Boolean).join('').toUpperCase();
}

export function LeftNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { has } = usePermissions();
  const links = LINKS.filter((link) => has(link.permission));

  async function onLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="flex h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <span className="text-base font-semibold tracking-tight text-white">Meridian Admin</span>
      </div>

      <div className="flex-1 space-y-0.5 px-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith(link.href) ? 'bg-sidebar-active text-white' : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-white',
            )}
          >
            <link.icon className="h-4 w-4" strokeWidth={2} />
            {link.label}
          </Link>
        ))}
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {initials(user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.email}</div>
            <div className="text-xs text-sidebar-muted">Signed in</div>
          </div>
          <Link
            href="/settings/security"
            title="Security settings"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <Settings className="h-4 w-4" strokeWidth={2} />
          </Link>
          <button
            onClick={onLogout}
            title="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </nav>
  );
}
