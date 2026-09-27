import * as React from 'react';

import { cn } from '@/lib/utils';
import { styleChampBase } from './input';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(styleChampBase, 'flex min-h-[88px] px-3 py-2.5 leading-relaxed', className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
