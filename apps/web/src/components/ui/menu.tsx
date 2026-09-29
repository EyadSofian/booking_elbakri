'use client';

import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

/** A small dropdown menu (keyboard and screen-reader friendly via Radix). */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(({ className, sideOffset = 6, align = 'end', ...props }, ref) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'z-50 min-w-[11rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md',
        'data-[state=open]:animate-pop',
        className,
      )}
      {...props}
    />
  </DropdownMenu.Portal>
));
MenuContent.displayName = 'MenuContent';

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenu.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors',
      'data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
      destructive && 'text-destructive data-[highlighted]:bg-danger-subtle',
      className,
    )}
    {...props}
  />
));
MenuItem.displayName = 'MenuItem';

export const MenuLabel = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>) => (
  <DropdownMenu.Label className={cn('px-2.5 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...props} />
);

export const MenuSeparator = () => <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />;
