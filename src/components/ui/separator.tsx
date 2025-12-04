import * as React from 'react';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, role = 'separator', 'aria-orientation': ariaOrientation, ...props }, ref) => (
  <div
    ref={ref}
    role={role}
    aria-orientation={ariaOrientation}
    className={cn(
      'shrink-0 bg-border',
      ariaOrientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };
