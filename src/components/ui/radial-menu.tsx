import { useState, useRef } from "react";
import { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
import { ContextMenu } from '@base-ui-components/react/context-menu';
import { cn } from '@/lib/utils';
import {
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  Star,
  Pin,
  X as XIcon,
} from 'lucide-react';

const DUMMY_MENU_ITEMS = [
  { id: 1, label: 'Copy', icon: Copy },
  { id: 2, label: 'Cut', icon: Scissors },
  { id: 3, label: 'Paste', icon: ClipboardPaste },
  { id: 4, label: 'Favorite', icon: Star },
  { id: 5, label: 'Pin', icon: Pin },
  { id: 6, label: 'Delete', icon: Trash2 },
];

type RadialMenuProps = {
  children?: React.ReactNode;
  menuItems?: MenuItem[];
  size?: number;
  iconSize?: number;
  bandWidth?: number;
  innerGap?: number;
  outerGap?: number;
  outerRingWidth?: number;
  onSelect?: (item: MenuItem) => void;
  activeItemIds?: number[]; // Tableau des IDs des items actuellement actifs
};

type MenuItem = {
  id: number;
  label: string;
  icon: LucideIcon;
};

type Point = { x: number; y: number };

const menuTransition: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 1,
};

const wedgeTransition: Transition = {
  duration: 0.05,
  ease: 'easeOut',
};

const FULL_CIRCLE = 360;
const START_ANGLE = -90;

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function polarToCartesian(radius: number, angleDeg: number): Point {
  const rad = degToRad(angleDeg);
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  };
}

function slicePath(
  index: number,
  total: number,
  wedgeRadius: number,
  innerRadius: number,
) {
  if (total <= 0) return '';

  // single item → full donut ring
  if (total === 1) {
    return `
      M ${wedgeRadius} 0
      A ${wedgeRadius} ${wedgeRadius} 0 1 1 ${-wedgeRadius} 0
      A ${wedgeRadius} ${wedgeRadius} 0 1 1 ${wedgeRadius} 0
      M ${innerRadius} 0
      A ${innerRadius} ${innerRadius} 0 1 0 ${-innerRadius} 0
      A ${innerRadius} ${innerRadius} 0 1 0 ${innerRadius} 0
    `;
  }

  const anglePerSlice = FULL_CIRCLE / total;
  const midDeg = START_ANGLE + anglePerSlice * index;
  const halfSlice = anglePerSlice / 2;

  const startDeg = midDeg - halfSlice;
  const endDeg = midDeg + halfSlice;

  const outerStart = polarToCartesian(wedgeRadius, startDeg);
  const outerEnd = polarToCartesian(wedgeRadius, endDeg);
  const innerStart = polarToCartesian(innerRadius, startDeg);
  const innerEnd = polarToCartesian(innerRadius, endDeg);

  const largeArcFlag = anglePerSlice > 180 ? 1 : 0;

  return `
    M ${outerStart.x} ${outerStart.y}
    A ${wedgeRadius} ${wedgeRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}
    L ${innerEnd.x} ${innerEnd.y}
    A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}
    Z
  `;
}

export const Component = ({
  children,
  menuItems = DUMMY_MENU_ITEMS,
  size = 240,
  iconSize = 18,
  bandWidth = 50,
  innerGap = 8,
  outerGap = 8,
  outerRingWidth = 12,
  onSelect,
  activeItemIds = [],
}: RadialMenuProps) => {
  const radius = size / 2;

  const outerRingOuterRadius = radius;
  const outerRingInnerRadius = outerRingOuterRadius - outerRingWidth;

  const wedgeOuterRadius = outerRingInnerRadius - outerGap;
  const wedgeInnerRadius = wedgeOuterRadius - bandWidth;

  const iconRingRadius = (wedgeOuterRadius + wedgeInnerRadius) / 2;

  const centerRadius = Math.max(wedgeInnerRadius - innerGap, 0);

  const slice = 360 / menuItems.length;

  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const resetActive = () => {
    setActiveIndex(null);
    setHoveredLabel(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) resetActive();
  };

  return (
    <ContextMenu.Root open={open} onOpenChange={handleOpenChange}>
      <ContextMenu.Trigger
        render={(triggerProps) => {
          return (
            <div
              {...triggerProps}
              className={cn('select-none outline-none', triggerProps.className || '')}
              onContextMenu={(e) => {
                // Si le menu est déjà ouvert, le fermer au lieu de le rouvrir
                if (open) {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  return;
                }
                // Sinon, laisser le comportement par défaut (ouvrir le menu)
                triggerProps.onContextMenu?.(e);
              }}
              onClick={(e) => {
                // Fermer le menu si on clique n'importe où quand il est ouvert
                if (open) {
                  setOpen(false);
                }
                triggerProps.onClick?.(e);
              }}
            >
              {children ? (
                children
              ) : (
                <div className="size-80 flex justify-center items-center border-2 border-dashed rounded-lg">
                  Right-click here.
                </div>
              )}
            </div>
          );
        }}
      />

      <AnimatePresence>
        {open && (
          <ContextMenu.Portal keepMounted>
            {/* Backdrop invisible pour capturer les clics */}
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
            />
            <ContextMenu.Positioner
              align="center"
              sideOffset={({ positioner }) => -positioner.height / 2}
              className="outline-none z-50"
            >
              <ContextMenu.Popup
                style={{ width: size, height: size }}
                className="relative rounded-full overflow-hidden shadow-xl outline-none"
                render={
                  <motion.div
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={menuTransition}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpen(false);
                    }}
                  />
                }
              >
                <svg
                  className="absolute inset-0 size-full"
                  viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`}
                  onMouseLeave={() => setHoveredLabel(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                  }}
                >
                  {menuItems.map((item, index) => {
                    const Icon = item.icon;
                    const midDeg = START_ANGLE + slice * index;
                    const { x: iconX, y: iconY } = polarToCartesian(
                      iconRingRadius,
                      midDeg,
                    );
                    const ICON_BOX = iconSize * 2;
                    const isActive = activeIndex === index;
                    const isToolActive = activeItemIds.includes(item.id); // L'outil est actuellement actif

                    return (
                      <g
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => itemRefs.current[index]?.click()}
                        onMouseEnter={() => {
                          setActiveIndex(index);
                          setHoveredLabel(item.label);
                          itemRefs.current[index]?.focus();
                        }}
                        onMouseLeave={() => {
                          setHoveredLabel(null);
                        }}
                      >
                        <motion.path
                          d={slicePath(
                            index,
                            menuItems.length,
                            outerRingOuterRadius,
                            outerRingInnerRadius,
                          )}
                          className={
                            isToolActive
                              ? 'fill-[#c0a080] dark:fill-[#d4b48f]' // Couleur primaire si l'outil est actif
                              : isActive 
                              ? 'fill-neutral-200 dark:fill-neutral-700'
                              : 'fill-neutral-100 dark:fill-neutral-800'
                          }
                          initial={false}
                          transition={wedgeTransition}
                        />
                        <motion.path
                          d={slicePath(
                            index,
                            menuItems.length,
                            wedgeOuterRadius,
                            wedgeInnerRadius,
                          )}
                          className={cn(
                            'stroke-neutral-300 dark:stroke-neutral-600 stroke-1',
                            isToolActive
                              ? 'fill-[#c0a080] dark:fill-[#d4b48f]' // Couleur primaire si l'outil est actif
                              : isActive
                              ? 'fill-neutral-200 dark:fill-neutral-700'
                              : 'fill-neutral-100 dark:fill-neutral-800'
                          )}
                          initial={false}
                          transition={wedgeTransition}
                        />

                        <foreignObject
                          x={iconX - ICON_BOX / 2}
                          y={iconY - ICON_BOX / 2}
                          width={ICON_BOX}
                          height={ICON_BOX}
                        >
                          <ContextMenu.Item
                            ref={(el) => {
                              itemRefs.current[index] =
                                el as HTMLElement | null;
                            }}
                            onFocus={() => setActiveIndex(index)}
                            onClick={() => {
                              onSelect?.(item);
                            }}
                            aria-label={item.label}
                            className={cn(
                              'size-full flex items-center justify-center rounded-full outline-none',
                              isToolActive
                                ? 'text-[#1c1c1c] dark:text-[#1c1c1c]' // Texte foncé si l'outil est actif (contraste avec couleur primaire)
                                : isActive 
                                ? 'text-neutral-900 dark:text-neutral-50'
                                : 'text-neutral-600 dark:text-neutral-400'
                            )}
                          >
                            <Icon
                              style={{ 
                                height: iconSize, 
                                width: iconSize,
                                strokeWidth: isToolActive ? 2.5 : 2 // Plus épais si actif
                              }}
                            />
                          </ContextMenu.Item>
                        </foreignObject>
                      </g>
                    );
                  })}

                  <circle
                    cx={0}
                    cy={0}
                    r={centerRadius}
                    className="fill-neutral-100 dark:fill-neutral-950 stroke-1 opacity-50 stroke-neutral-400 dark:stroke-neutral-600"
                  />
                  
                  {/* Label au centre avec animation */}
                  <AnimatePresence mode="wait">
                    {hoveredLabel ? (
                      <motion.g
                        key="label"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        {/* Fond semi-transparent pour meilleure lisibilité */}
                        <rect
                          x={-centerRadius * 0.8}
                          y={-10}
                          width={centerRadius * 1.6}
                          height={20}
                          rx={4}
                          className="fill-neutral-200 dark:fill-neutral-800 opacity-80"
                        />
                        <text
                          x={0}
                          y={0}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-neutral-900 dark:fill-neutral-50 font-semibold pointer-events-none select-none"
                          style={{ 
                            fontSize: hoveredLabel.length > 15 ? '11px' : '13px',
                            letterSpacing: '0.3px'
                          }}
                        >
                          {hoveredLabel}
                        </text>
                      </motion.g>
                    ) : (
                      <motion.g
                        key="close-button"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.2 }}
                      >
                        {/* Cercle cliquable au centre */}
                        <circle
                          cx={0}
                          cy={0}
                          r={centerRadius * 0.6}
                          className="fill-neutral-200 dark:fill-neutral-800 cursor-pointer hover:fill-neutral-300 dark:hover:fill-neutral-700 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                          }}
                        />
                        {/* Icône X avec foreignObject pour utiliser lucide-react */}
                        <foreignObject
                          x={-centerRadius * 0.3}
                          y={-centerRadius * 0.3}
                          width={centerRadius * 0.6}
                          height={centerRadius * 0.6}
                          className="pointer-events-none"
                        >
                          <div className="flex items-center justify-center w-full h-full">
                            <XIcon 
                              className="text-neutral-700 dark:text-neutral-300"
                              style={{ width: centerRadius * 0.35, height: centerRadius * 0.35 }}
                            />
                          </div>
                        </foreignObject>
                      </motion.g>
                    )}
                  </AnimatePresence>
                  
                 
                </svg>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        )}
      </AnimatePresence>
    </ContextMenu.Root>
  );
};
