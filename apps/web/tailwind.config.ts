import type { Config } from 'tailwindcss';

/**
 * ELBAKRI OVERSEAS — a calm workspace built around the logo's navy.
 *
 * Warm "paper" surfaces instead of cold grey (the team comes from Excel sheets
 * and ledgers), the brand navy for structure, and one sun-amber accent for
 * whatever needs attention today. Every booking status has its own colour,
 * used identically on every screen.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2fa',
          100: '#d8e1f3',
          200: '#b0c2e6',
          300: '#7f9bd4',
          400: '#4f74be',
          500: '#2d51a0',
          600: '#1d3b80',
          700: '#152c63',
          800: '#0f2352',
          900: '#0b1a3f',
          950: '#060f26',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          muted: 'hsl(var(--surface-muted))',
          sunken: 'hsl(var(--surface-sunken))',
        },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        sun: { DEFAULT: 'hsl(var(--sun))', subtle: 'hsl(var(--sun-subtle))', foreground: 'hsl(var(--sun-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', subtle: 'hsl(var(--success-subtle))' },
        danger: { DEFAULT: 'hsl(var(--danger))', subtle: 'hsl(var(--danger-subtle))' },
        // One colour per booking status, the same on every screen.
        st: {
          new: 'hsl(var(--st-new))',
          'new-bg': 'hsl(var(--st-new-bg))',
          progress: 'hsl(var(--st-progress))',
          'progress-bg': 'hsl(var(--st-progress-bg))',
          confirmed: 'hsl(var(--st-confirmed))',
          'confirmed-bg': 'hsl(var(--st-confirmed-bg))',
          done: 'hsl(var(--st-done))',
          'done-bg': 'hsl(var(--st-done-bg))',
          cancelled: 'hsl(var(--st-cancelled))',
          'cancelled-bg': 'hsl(var(--st-cancelled-bg))',
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        sidebar: '15rem',
        topbar: '3.5rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 35 82 / 0.05)',
        sm: '0 1px 3px 0 rgb(15 35 82 / 0.08), 0 1px 2px -1px rgb(15 35 82 / 0.06)',
        md: '0 6px 16px -6px rgb(15 35 82 / 0.14), 0 2px 4px -2px rgb(15 35 82 / 0.06)',
        overlay: '0 24px 48px -16px rgb(6 15 38 / 0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-end': { from: { transform: 'translateX(var(--slide-from, 100%))' }, to: { transform: 'none' } },
        pop: { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        rise: 'rise 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'slide-in-end': 'slide-in-end 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
        pop: 'pop 0.14s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
