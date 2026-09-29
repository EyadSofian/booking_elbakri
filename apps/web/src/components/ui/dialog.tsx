'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Two overlays built on the same accessible primitive (focus trap, Esc, click
 * outside): a centred Dialog for short questions and a Sheet that slides in
 * from the reading end for viewing and editing a booking.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-950/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />;
}

function CloseX({ label }: { label: string }) {
  return (
    <DialogPrimitive.Close
      className="absolute end-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={label}
    >
      <X className="size-4" />
    </DialogPrimitive.Close>
  );
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: 'sm' | 'md' | 'lg'; closeLabel?: string }
>(({ className, children, size = 'md', closeLabel = 'Close', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl border bg-surface shadow-overlay',
        'data-[state=open]:animate-pop sm:inset-x-auto sm:bottom-auto sm:start-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:rounded-xl',
        'sm:-translate-y-1/2 sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2',
        size === 'sm' && 'sm:w-full sm:max-w-sm',
        size === 'md' && 'sm:w-full sm:max-w-lg',
        size === 'lg' && 'sm:w-full sm:max-w-2xl',
        className,
      )}
      {...props}
    >
      {children}
      <CloseX label={closeLabel} />
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

/** A panel sliding in from the reading end — for a booking's details and its form. */
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: 'md' | 'lg' | 'xl'; closeLabel?: string }
>(({ className, children, width = 'lg', closeLabel = 'Close', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s bg-background shadow-overlay',
        'data-[state=open]:animate-slide-in-end ltr:[--slide-from:100%] rtl:[--slide-from:-100%]',
        width === 'md' && 'sm:max-w-md',
        width === 'lg' && 'sm:max-w-xl',
        width === 'xl' && 'sm:max-w-3xl',
        className,
      )}
      {...props}
    >
      {children}
      <CloseX label={closeLabel} />
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b bg-surface px-5 py-4 pe-12', className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('scroll-thin flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t bg-surface px-5 py-3', className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold leading-tight', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-xs text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';
