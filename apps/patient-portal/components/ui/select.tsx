import * as React from 'react';
import { cn } from '@/lib/utils';

/** A plain native <select> styled to match Input — no Radix dependency needed for a simple
 * single-choice dropdown, unlike the richer combobox-style Select used in the staff apps. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Select.displayName = 'Select';

export { Select };
