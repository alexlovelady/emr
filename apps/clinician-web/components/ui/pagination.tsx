'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * Cursor-free "did the page fill up" pagination — the page just asks for `pageSize + 1` rows and
 * hides the extra one, so `hasMore` needs no separate COUNT(*) query. Every list endpoint this
 * pairs with treats `limit`/`offset` as opt-in, so pages that don't pass them are unaffected.
 */
export function Pagination({ page, hasMore }: { page: number; hasMore: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage === 0) params.delete('page');
    else params.set('page', String(nextPage));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  if (page === 0 && !hasMore) return null;

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <span className="text-sm text-muted-foreground">Page {page + 1}</span>
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => goTo(page - 1)}>
        Previous
      </Button>
      <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => goTo(page + 1)}>
        Next
      </Button>
    </div>
  );
}
