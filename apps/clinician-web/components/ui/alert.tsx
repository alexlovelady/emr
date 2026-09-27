import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-muted text-foreground',
      destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export { Alert };
