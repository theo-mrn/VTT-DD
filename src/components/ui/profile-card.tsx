"use client"

import { useState, useEffect, useMemo } from "react"
import { Users, Sword, Scroll, Shield, MessageSquare, UserPlus, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { BorderBeam } from "@/components/ui/border-beam"

interface ProfileCardProps {
  name?: string
  characterName?: string
  bio?: string
  avatarUrl?: string
  backgroundUrl?: string
  level?: number
  exp?: number // 0 to 100
  timeSpent?: number // in minutes
  achievements?: number
  isInitialFriend?: boolean
  borderType?: "none" | "blue" | "orange" | "magic" | "magic_purple" | "magic_green" | "magic_red" | "magic_double"
  onAction?: (action: string) => void
}

export function ProfileCard({
  name = "Aventurier",
  characterName = "Héros sans nom",
  bio = "Un voyageur mystérieux explorant les terres de VTT-DD.",
  avatarUrl,
  backgroundUrl = "https://images.unsplash.com/photo-1538370621607-4919ce7889b3?q=80&w=1000&auto=format&fit=crop",
  level = 1,
  exp = 65,
  timeSpent = 0,
  achievements = 0,
  isInitialFriend = false,
  borderType = "none",
  onAction,
}: ProfileCardProps) {
  const [isFollowing, setIsFollowing] = useState(isInitialFriend)
  const [expProgress, setExpProgress] = useState(0)
  const [animatedTime, setAnimatedTime] = useState(0)
  const [animatedAchievements, setAnimatedAchievements] = useState(0)

  // Electric effect state
  const ids = useMemo(() => {
    const key = Math.random().toString(36).slice(2, 8);
    return {
      swirl: `swirl-${key}`
    };
  }, []);

  const electricColor = borderType === "blue" ? "#3b82f6" : "#c0a080";
  const filterURL = `url(#${ids.swirl})`;

  const isHours = timeSpent >= 60
  const hours = timeSpent / 60
  const displayUnit = isHours ? "h" : "min"
  const targetTime = isHours ? parseFloat(hours.toFixed(1)) : timeSpent

  // Calculate level and exp from timeSpent
  // 1 level every 2 hours (120 minutes)
  const calcLevel = Math.floor(timeSpent / 120) + 1
  const calcExp = Math.floor(((timeSpent % 120) / 120) * 100)

  // Use calculated values if timeSpent is provided, otherwise fallback to props
  const finalLevel = timeSpent > 0 ? calcLevel : level
  const finalExp = timeSpent > 0 ? calcExp : exp

  // Animate experience bar
  useEffect(() => {
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setExpProgress((prev) => {
          if (prev >= finalExp) {
            clearInterval(interval)
            return finalExp
          }
          return prev + 1
        })
      }, 20)
      return () => clearInterval(interval)
    }, 300)
    return () => clearTimeout(timer)
  }, [finalExp])

  // Animate counters
  useEffect(() => {
    const duration = 2000
    const steps = 60
    const stepDuration = duration / steps

    const timeIncrement = targetTime / steps
    const achievementsIncrement = (achievements || 0) / steps

    let currentStep = 0

    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        currentStep++

        // Use a more precise increment for the animation
        const newTime = timeIncrement * currentStep
        setAnimatedTime(isHours ? parseFloat(Math.min(newTime, targetTime).toFixed(1)) : Math.min(Math.floor(newTime), targetTime))

        setAnimatedAchievements(Math.min(Math.floor(achievementsIncrement * currentStep), achievements || 0))

        if (currentStep >= steps) {
          clearInterval(interval)
        }
      }, stepDuration)
      return () => clearInterval(interval)
    }, 500)

    return () => clearTimeout(timer)
  }, [timeSpent, achievements, targetTime, isHours])

  const handleFriendAction = () => {
    setIsFollowing(!isFollowing)
    onAction?.(isFollowing ? "remove_friend" : "add_friend")
  }

  return (
    <div className="w-full max-w-sm mx-auto ec-wrap group">
      {/* SVG Filters */}
      <svg className="svg-container" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id={ids.swirl} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="1" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate attributeName="dy" values="700; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="1" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate attributeName="dy" values="0; -700" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise3" seed="2" />
            <feOffset in="noise3" dx="0" dy="0" result="offsetNoise3">
              <animate attributeName="dx" values="490; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise4" seed="2" />
            <feOffset in="noise4" dx="0" dy="0" result="offsetNoise4">
              <animate attributeName="dx" values="0; -490" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />

            <feDisplacementMap
              in="SourceGraphic"
              in2="combinedNoise"
              scale="30"
              xChannelSelector="R"
              yChannelSelector="B"
            />
          </filter>
        </defs>
      </svg>

      <div className="card-container" style={{ ["--electric-border-color" as any]: electricColor, ["--f" as any]: filterURL }}>
        <div className="content-container">
          <div className="relative min-h-[450px]">
            {/* Base Card Background */}
            <div className="absolute inset-0 bg-card/90 backdrop-blur-md border border-white/5 rounded-[1.8rem] shadow-2xl" />

            {/* Content with its own overflow-hidden to crop images properly */}
            <div className="relative z-10 rounded-[1.8rem] overflow-hidden">
              {/* Header with background */}
              <div className="relative h-40 bg-zinc-900 overflow-hidden">
                <img
                  src={backgroundUrl || "/placeholder.svg"}
                  alt="Background"
                  className="w-full h-full object-cover opacity-40 transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-80" />

                {/* Friend button */}
                <button
                  onClick={handleFriendAction}
                  className={cn(
                    "absolute top-4 right-4 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 flex items-center gap-2",
                    isFollowing
                      ? "bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                  )}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      Amis
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Demande d'amis
                    </>
                  )}
                </button>
              </div>

              {/* Profile content */}
              <div className="px-6 pb-2 -mt-12 relative">
                {/* Avatar */}
                <div className="relative w-24 h-24 mb-4">
                  <div className="w-full h-full rounded-full border-4 border-card overflow-hidden bg-zinc-900 shadow-xl ring-2 ring-primary/20">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-primary">
                        <span className="text-3xl font-serif">{name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold h-7 w-7 rounded-full flex items-center justify-center border-2 border-card">
                    {finalLevel}
                  </div>
                </div>

                {/* Experience bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Niveau {finalLevel}</span>
                    <span className="text-[10px] text-muted-foreground font-bold">{finalExp}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-amber-600 via-orange-500 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)] transition-all duration-300 ease-out"
                      style={{ width: `${expProgress}%` }}
                    />
                  </div>
                </div>

                {/* Name and title */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-0.5 tracking-tight group-hover:text-primary transition-colors">
                    {name}
                  </h2>
                  <p className="text-primary/70 text-xs font-medium uppercase tracking-wider mb-2">
                    {characterName}
                  </p>
                  <p className="text-muted-foreground text-sm leading-relaxed font-light line-clamp-2">
                    {bio}
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 mb-6 py-4 border-t border-b border-border/50">
                  <div className="text-center border-r border-border/50">
                    <div className="text-xl font-bold text-foreground mb-0.5">
                      {animatedTime}{displayUnit}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Temps de jeu</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-foreground mb-0.5">{animatedAchievements}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Succès</div>
                  </div>
                </div>
              </div>
            </div>

            {/* BorderBeam on top of everything, following the base card radius */}
            {borderType !== "none" && borderType !== "magic_double" && (
              <div className="absolute inset-0 z-30 rounded-[1.8rem] pointer-events-none overflow-hidden">
                <BorderBeam
                  duration={borderType?.startsWith("magic") ? 6 : 12}
                  delay={9}
                  colorFrom={
                    borderType === "blue" ? "#3b82f6" :
                      borderType === "orange" ? "#fbbf24" :
                        borderType === "magic_purple" ? "#9333ea" :
                          borderType === "magic_green" ? "#10b981" :
                            borderType === "magic_red" ? "#dc2626" :
                              "#9c40ff"
                  }
                  colorTo={
                    borderType === "blue" ? "#60a5fa" :
                      borderType === "orange" ? "#f59e0b" :
                        borderType === "magic_purple" ? "#ec4899" :
                          borderType === "magic_green" ? "#84cc16" :
                            borderType === "magic_red" ? "#f97316" :
                              "#ffaa40"
                  }
                  borderWidth={borderType?.startsWith("magic") ? 2 : 1}
                  className="z-50"
                />
              </div>
            )}

            {borderType === "magic_double" && (
              <div className="absolute inset-0 z-30 rounded-[1.8rem] pointer-events-none overflow-hidden">
                <BorderBeam
                  duration={6}
                  delay={0}
                  colorFrom="#06b6d4" // Cyan
                  colorTo="#3b82f6" // Blue
                  borderWidth={2}
                  className="z-50"
                />
                <BorderBeam
                  duration={6}
                  delay={3}
                  colorFrom="#a855f7" // Purple
                  colorTo="#ec4899" // Pink
                  borderWidth={2}
                  className="z-50"
                />
              </div>
            )}
          </div>
        </div>

        {/* Electric aura on top - only show if borderType is blue or orange */}
        {(borderType === "blue" || borderType === "orange") && (
          <div className="inner-container">
            <div className="border-outer">
              <div className="main-card-effect" />
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .ec-wrap {
          position: relative;
          padding: 24px;
          color-scheme: dark;
        }

        .svg-container {
          position: absolute;
          width: 0;
          height: 0;
          overflow: hidden;
        }

        .card-container {
          border-radius: 2rem;
          position: relative;
          background: oklch(0.1 0 0);
        }

        .inner-container {
          position: absolute;
          inset: -4px;
          pointer-events: none;
          z-index: 30; /* Over everything */
        }

        .border-outer {
          position: absolute;
          inset: 0;
          border-radius: 2.1rem;
          border: 1px solid oklch(from var(--electric-border-color) l c h / 0.3);
          box-shadow: 0 0 15px oklch(from var(--electric-border-color) l c h / 0.1);
        }

        .main-card-effect {
          width: 100%;
          height: 100%;
          border-radius: 2.1rem;
          border: 4px solid var(--electric-border-color);
          filter: var(--f);
          background: transparent; /* Essential to see content below */
        }

        .content-container {
          position: relative;
          z-index: 10;
        }
      `}</style>
    </div>
  )
}
