"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export interface CommandItem {
  id: string
  icon: ReactNode
  label: string
  shortcut?: string
  onClick?: () => void
}

export interface CircularCommandMenuProps {
  items?: CommandItem[]
  trigger?: ReactNode
  className?: string
  buttonClassName?: string
  radius?: number
  startAngle?: number
  endAngle?: number
  tooltipPlacement?: "left" | "right" | "top" | "bottom"
  onSelect?: (item: CommandItem) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function Component({
  items = [],
  trigger,
  className,
  buttonClassName,
  radius = 120,
  startAngle = 0,
  endAngle = 360,
  tooltipPlacement = "right",
  onSelect,
  open,
  onOpenChange,
}: CircularCommandMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
    if (!isControlled) {
      setInternalOpen(newOpen)
    }
  }, [isControlled, onOpenChange])

  const [activeIndex, setActiveIndex] = useState(0)

  // Defensive check for items
  const safeItems = items || []
  const itemCount = safeItems.length

  // Calculate angle per item based on the total arc
  const totalArc = endAngle - startAngle
  // For a full circle (360°), divide by itemCount to avoid overlap at start/end
  // For partial arcs, divide by (itemCount - 1) to include both endpoints
  const isFullCircle = Math.abs(totalArc - 360) < 0.01
  const angleStep = itemCount > 1
    ? (isFullCircle ? totalArc / itemCount : totalArc / (itemCount - 1))
    : 0

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || itemCount === 0) return

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault()
          setActiveIndex((prev) => (prev + 1) % itemCount)
          break
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault()
          setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount)
          break
        case "Enter":
          e.preventDefault()
          const selectedItem = safeItems[activeIndex]
          if (selectedItem) {
            selectedItem.onClick?.()
            onSelect?.(selectedItem)
          }
          handleOpenChange(false)
          break
        case "Escape":
          e.preventDefault()
          handleOpenChange(false)
          break
      }
    },
    [isOpen, activeIndex, safeItems, itemCount, onSelect, handleOpenChange],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const getItemPosition = (index: number) => {
    // For single item, put it in the middle of the arc
    const angle = itemCount === 1
      ? (startAngle + totalArc / 2) * (Math.PI / 180)
      : (startAngle + index * angleStep) * (Math.PI / 180)

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  }

  const getTooltipClasses = () => {
    switch (tooltipPlacement) {
      case "left":
        return "right-full mr-12 top-0"
      case "right":
        return "left-full ml-3 top-1/2 -translate-y-1/2"
      case "top":
        return "bottom-full mb-3 left-1/2 -translate-x-1/2"
      case "bottom":
        return "top-full mt-3 left-1/2 -translate-x-1/2"
      default:
        return "left-full ml-3 top-1/2 -translate-y-1/2"
    }
  }

  return (
    <div className={cn("relative inline-flex", className || "")}>
      {/* Trigger */}
      <motion.button
        onClick={() => handleOpenChange(!isOpen)}
        className={cn(
          "relative z-30 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-lg",
          "hover:bg-primary/90 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
          buttonClassName || ""
        )}
        whileTap={{ scale: 0.95 }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <motion.div animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {trigger || (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </motion.div>
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10 backdrop-blur-sm"
            onClick={() => handleOpenChange(false)}
          />
        )}
      </AnimatePresence>

      {/* Menu Items */}
      <AnimatePresence>
        {isOpen && itemCount > 0 && (
          <div className="absolute left-1/2 top-1/2 z-20" role="menu">
            {safeItems.map((item, index) => {
              const position = getItemPosition(index)
              const isActive = activeIndex === index

              return (
                <motion.button
                  key={item.id}
                  initial={{
                    opacity: 0,
                    x: 0,
                    y: 0,
                    scale: 0,
                  }}
                  animate={{
                    opacity: 1,
                    x: position.x - 24,
                    y: position.y - 24,
                    scale: 1,
                  }}
                  exit={{
                    opacity: 0,
                    x: 0,
                    y: 0,
                    scale: 0,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                    delay: index * 0.05,
                  }}
                  onClick={() => {
                    item.onClick?.()
                    onSelect?.(item)
                    handleOpenChange(false)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  style={{ zIndex: isActive ? 5 : 1 }}
                  className={cn(
                    "absolute flex h-12 w-12 items-center justify-center rounded-full",
                    "border border-border bg-card shadow-lg",
                    "transition-colors hover:bg-secondary",
                    isActive ? "ring-2 ring-primary bg-secondary" : "",
                  )}
                  role="menuitem"
                  aria-label={item.label}
                >
                  <div className="text-foreground">{item.icon}</div>

                  {/* Tooltip */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{
                      opacity: isActive ? 1 : 0,
                      scale: isActive ? 1 : 0.9,
                    }}
                    style={{ zIndex: 10 }}
                    className={cn(
                      "absolute whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border border-border",
                      getTooltipClasses()
                    )}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="ml-2 text-muted-foreground">{item.shortcut}</span>}
                  </motion.div>
                </motion.button>
              )
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { Component } 