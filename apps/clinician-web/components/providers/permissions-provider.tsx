'use client';

import { createContext, useContext, useMemo } from 'react';

const PermissionsContext = createContext<Set<string> | null>(null);

export function PermissionsProvider({ permissions, children }: { permissions: string[]; children: React.ReactNode }) {
  const set = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionsContext.Provider value={set}>{children}</PermissionsContext.Provider>;
}

/**
 * UX-only gate for hiding/disabling actions the current user can't use — the real authorization
 * boundary is always the backend's own @RequirePermission check on each Server Action's endpoint.
 */
export function usePermissions(): { has: (key: string) => boolean } {
  const set = useContext(PermissionsContext);
  if (!set) throw new Error('usePermissions() must be used within a PermissionsProvider');
  return { has: (key: string) => set.has(key) };
}
