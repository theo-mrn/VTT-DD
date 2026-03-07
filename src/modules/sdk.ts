'use client';

import React from 'react';
import { moduleRegistry } from './registry';
import { gameEventBus } from './event-bus';
import type { ModuleDefinition } from './types';

// Re-export UI components for external modules
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Lucide icons — expose the full set
import * as LucideIcons from 'lucide-react';

/**
 * The global SDK exposed to external modules via window.__VTT_SDK__
 *
 * External module authors use this to:
 * 1. Access React (so they don't bundle their own copy)
 * 2. Use the app's UI components (consistent look & feel)
 * 3. Register their module into the registry
 * 4. Listen/emit on the event bus
 */
export interface VTTModuleSDK {
  /** React library — use this instead of bundling React */
  React: typeof React;

  /** Register a module definition */
  register: (definition: ModuleDefinition) => void;

  /** Event bus for inter-module communication */
  events: {
    on: typeof gameEventBus.on;
    emit: typeof gameEventBus.emit;
  };

  /** Shadcn/ui components */
  ui: {
    Button: typeof Button;
    ScrollArea: typeof ScrollArea;
    Badge: typeof Badge;
    Input: typeof Input;
    Label: typeof Label;
    Switch: typeof Switch;
    Separator: typeof Separator;
    Tabs: typeof Tabs;
    TabsList: typeof TabsList;
    TabsTrigger: typeof TabsTrigger;
    TabsContent: typeof TabsContent;
    Card: typeof Card;
    CardHeader: typeof CardHeader;
    CardTitle: typeof CardTitle;
    CardDescription: typeof CardDescription;
    CardContent: typeof CardContent;
    CardFooter: typeof CardFooter;
    Select: typeof Select;
    SelectTrigger: typeof SelectTrigger;
    SelectValue: typeof SelectValue;
    SelectContent: typeof SelectContent;
    SelectItem: typeof SelectItem;
    Tooltip: typeof Tooltip;
    TooltipTrigger: typeof TooltipTrigger;
    TooltipContent: typeof TooltipContent;
    TooltipProvider: typeof TooltipProvider;
    Dialog: typeof Dialog;
    DialogTrigger: typeof DialogTrigger;
    DialogContent: typeof DialogContent;
    DialogHeader: typeof DialogHeader;
    DialogTitle: typeof DialogTitle;
    DialogDescription: typeof DialogDescription;
    DialogFooter: typeof DialogFooter;
  };

  /** Lucide icons */
  icons: typeof LucideIcons;

  /** SDK version */
  version: string;
}

declare global {
  interface Window {
    __VTT_SDK__?: VTTModuleSDK;
  }
}

/**
 * Initialize the global SDK on window.
 * Called once by ModuleProvider on mount.
 */
export function initSDK(): void {
  if (typeof window === 'undefined') return;
  if (window.__VTT_SDK__) return; // already initialized

  window.__VTT_SDK__ = {
    React,
    version: '1.0.0',

    register: (definition: ModuleDefinition) => {
      // Mark external modules so we can distinguish them
      definition.__external = true;
      moduleRegistry.register(definition);
      console.log(`[VTT SDK] Module "${definition.manifest.id}" registered from external source.`);
    },

    events: {
      on: gameEventBus.on.bind(gameEventBus),
      emit: gameEventBus.emit.bind(gameEventBus),
    },

    ui: {
      Button, ScrollArea, Badge, Input, Label, Switch, Separator,
      Tabs, TabsList, TabsTrigger, TabsContent,
      Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
      Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
      Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
      Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
    },

    icons: LucideIcons,
  };

  console.log('[VTT SDK] Global SDK initialized on window.__VTT_SDK__');
}
