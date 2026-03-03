"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const sonnerTheme = ['light', 'dark', 'system'].includes(theme) ? theme : 'dark'

  return (
    <Sonner
      theme={sonnerTheme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:!w-fit group-[.toaster]:bg-gradient-to-br group-[.toaster]:from-[var(--bg-card)] group-[.toaster]:to-[var(--bg-darker)]/95 group-[.toaster]:text-[var(--text-primary)] group-[.toaster]:border group-[.toaster]:border-[var(--accent-brown)]/30 group-[.toaster]:border-l-[4px] group-[.toaster]:border-l-[var(--accent-brown)] group-[.toaster]:shadow-2xl group-[.toaster]:rounded-md group-[.toaster]:pl-5 group-[.toaster]:pr-4 group-[.toaster]:py-4 group-[.toaster]:font-body",
          title: "group-[.toast]:font-title group-[.toast]:text-[var(--accent-brown)] group-[.toast]:text-xs group-[.toast]:font-bold group-[.toast]:uppercase group-[.toast]:tracking-[0.15em] group-[.toast]:mb-0.5",
          description: "group-[.toast]:text-[var(--text-secondary)] group-[.toast]:text-sm group-[.toast]:leading-snug",
          actionButton:
            "group-[.toast]:bg-[var(--accent-brown)] group-[.toast]:text-[var(--bg-dark)] group-[.toast]:text-[10px] group-[.toast]:font-bold group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:rounded-sm group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:hover:brightness-110 group-[.toast]:transition-all group-[.toast]:mt-2",
          cancelButton:
            "group-[.toast]:bg-transparent group-[.toast]:text-[var(--text-secondary)] group-[.toast]:border group-[.toast]:border-[var(--border-color)] group-[.toast]:text-[10px] group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:rounded-sm group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:hover:bg-[var(--bg-darker)] group-[.toast]:mt-2",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
