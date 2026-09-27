'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

/** Onglets en « pilule » sur fond discret. `variante="ligne"` : soulignement, pour les en-têtes de page. */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variante?: 'pilule' | 'ligne' }
>(({ className, variante = 'pilule', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variante={variante}
    className={cn(
      'group/tabs inline-flex items-center text-muted-foreground',
      variante === 'pilule' && 'h-9 gap-0.5 rounded-lg border border-border bg-surface p-0.5',
      variante === 'ligne' && 'h-10 w-full justify-start gap-5 border-b border-border',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-medium transition-all',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5',
      // Pilule
      'group-data-[variante=pilule]/tabs:h-full group-data-[variante=pilule]/tabs:rounded-md group-data-[variante=pilule]/tabs:px-3',
      'group-data-[variante=pilule]/tabs:hover:text-foreground',
      'group-data-[variante=pilule]/tabs:data-[state=active]:bg-surface-3 group-data-[variante=pilule]/tabs:data-[state=active]:text-foreground group-data-[variante=pilule]/tabs:data-[state=active]:shadow-surface',
      // Ligne
      'group-data-[variante=ligne]/tabs:relative group-data-[variante=ligne]/tabs:h-full group-data-[variante=ligne]/tabs:px-0.5',
      'group-data-[variante=ligne]/tabs:hover:text-foreground group-data-[variante=ligne]/tabs:data-[state=active]:text-foreground',
      'group-data-[variante=ligne]/tabs:after:absolute group-data-[variante=ligne]/tabs:after:inset-x-0 group-data-[variante=ligne]/tabs:after:-bottom-px group-data-[variante=ligne]/tabs:after:h-0.5 group-data-[variante=ligne]/tabs:after:rounded-full',
      'group-data-[variante=ligne]/tabs:data-[state=active]:after:bg-primary',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none data-[state=active]:animate-fade-up', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
