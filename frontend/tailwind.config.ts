import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

/** Couleur tirée d'une variable HSL (« 40 48% 59% »), avec opacité Tailwind (`bg-primary/10`). */
const hsl = (variable: string) => `hsl(var(${variable}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  // Survol seulement sur les appareils qui le gèrent : évite le double tap sur écran tactile
  future: {
    hoverOnlyWhenSupported: true,
  },
  // Sans les tests : aucune classe d'interface, et un test supprimé ne casse plus le CSS
  content: [
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    // Fonctions de la carte : interface (ui/) et manifestes (classes des menus de la barre)
    './src/lib/map/features/**/*.{ts,tsx}',
    '!./src/**/*.test.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '475px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        logo: ['var(--font-aclonica)', 'var(--font-sans)', 'sans-serif'],
      },
      colors: {
        background: hsl('--background'),
        foreground: hsl('--foreground'),
        surface: {
          DEFAULT: hsl('--surface'),
          2: hsl('--surface-2'),
          3: hsl('--surface-3'),
        },
        card: {
          DEFAULT: hsl('--card'),
          foreground: hsl('--card-foreground'),
        },
        popover: {
          DEFAULT: hsl('--popover'),
          foreground: hsl('--popover-foreground'),
        },
        primary: {
          DEFAULT: hsl('--primary'),
          foreground: hsl('--primary-foreground'),
          strong: hsl('--primary-strong'),
        },
        secondary: {
          DEFAULT: hsl('--secondary'),
          foreground: hsl('--secondary-foreground'),
        },
        muted: {
          DEFAULT: hsl('--muted'),
          foreground: hsl('--muted-foreground'),
        },
        subtle: hsl('--subtle'),
        accent: {
          DEFAULT: hsl('--accent'),
          foreground: hsl('--accent-foreground'),
        },
        destructive: {
          DEFAULT: hsl('--destructive'),
          foreground: hsl('--destructive-foreground'),
        },
        success: hsl('--success'),
        warning: hsl('--warning'),
        info: hsl('--info'),
        arcane: hsl('--arcane'),
        border: hsl('--border'),
        'border-strong': hsl('--border-strong'),
        input: hsl('--input'),
        ring: hsl('--ring'),
      },
      borderRadius: {
        '2xl': 'calc(var(--radius) + 8px)',
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Relief discret des surfaces sombres : liseré clair en haut, ombre portée douce
        surface: '0 1px 0 0 hsl(0 0% 100% / 0.04) inset, 0 1px 2px 0 hsl(0 0% 0% / 0.4)',
        elevated:
          '0 1px 0 0 hsl(0 0% 100% / 0.06) inset, 0 12px 32px -8px hsl(0 0% 0% / 0.6), 0 2px 6px -2px hsl(0 0% 0% / 0.4)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.35), 0 8px 32px -8px hsl(var(--primary) / 0.45)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'border-beam': {
          '100%': { 'offset-distance': '100%' },
        },
        shine: {
          '0%': { 'background-position': '0% 0%' },
          '50%': { 'background-position': '100% 100%' },
          '100%': { 'background-position': '0% 0%' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'shake-die': {
          '0%, 100%': { transform: 'rotate(0deg) scale(1)' },
          '25%': { transform: 'rotate(-12deg) scale(1.05)' },
          '75%': { transform: 'rotate(12deg) scale(1.05)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2s infinite linear',
        // Signaux ponctuels : quelques passages puis fixe
        'shimmer-few': 'shimmer 2s 3 linear',
        'pulse-few': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 4',
        'border-beam': 'border-beam var(--duration) infinite linear',
        shine: 'shine var(--duration) infinite linear',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'glow-pulse-few': 'glow-pulse 3s ease-in-out 3 forwards',
        // État durable (son en lecture) : respiration d'opacité lente, rien d'autre
        'pulse-slow': 'glow-pulse 4s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'shake-die': 'shake-die 0.35s ease-in-out infinite',
      },
    },
  },
  plugins: [animate, typography],
};
export default config;
