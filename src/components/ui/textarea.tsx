import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-[#E2C048]/40 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-colors',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
