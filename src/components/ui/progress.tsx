import * as React from 'react';

import { cn } from '@/lib/utils';

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & { value?: number };

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value = 0, ...props }, ref) => {
  const clampedValue = Math.min(Math.max(value, 0), 100);

  return (
    <div ref={ref} className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}>
      <div className="h-full bg-primary transition-all" style={{ width: `${clampedValue}%` }} />
    </div>
  );
});
Progress.displayName = 'Progress';

export { Progress };
