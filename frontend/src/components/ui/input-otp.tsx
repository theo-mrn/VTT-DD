'use client';

import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';

import { cn } from '@/lib/utils';

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn(
      'flex items-center gap-2 has-[:disabled]:opacity-50',
      containerClassName,
    )}
    className={cn('disabled:cursor-not-allowed', className)}
    {...props}
  />
));
InputOTP.displayName = 'InputOTP';

const InputOTPGroup = React.forwardRef<
  React.ElementRef<'div'>,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center gap-1.5', className)} {...props} />
));
InputOTPGroup.displayName = 'InputOTPGroup';

const InputOTPSlot = React.forwardRef<
  React.ElementRef<'div'>,
  React.ComponentPropsWithoutRef<'div'> & { index: number }
>(({ index, className, ...props }, ref) => {
  const contexte = React.useContext(OTPInputContext);
  const slot = contexte.slots[index];
  const char = slot?.char;
  const actif = slot?.isActive;
  const curseur = slot?.hasFakeCaret;

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex size-12 items-center justify-center rounded-xl border border-input bg-surface-2/60 font-mono text-xl font-semibold uppercase text-foreground shadow-surface transition-all sm:size-14 sm:text-2xl',
        char && 'border-border-strong bg-surface-2',
        actif && 'z-10 border-primary/70 ring-4 ring-primary/15',
        className,
      )}
      {...props}
    >
      {char}
      {curseur && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px animate-pulse bg-primary" />
        </div>
      )}
    </div>
  );
});
InputOTPSlot.displayName = 'InputOTPSlot';

const InputOTPSeparator = () => (
  <div role="separator" className="mx-1 h-px w-3 bg-border-strong" aria-hidden />
);

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
