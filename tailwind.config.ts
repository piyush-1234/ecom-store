import type { Config } from 'tailwindcss';

/**
 * Brand palette (Phase 0 gate):
 *   ink        — near-black, primary text / primary buttons
 *   off-white  — warm surface
 *   olive      — accent (badges, links, focus rings)
 *
 * Colours are exposed as HSL CSS variables (shadcn/ui convention) so components
 * reference semantic tokens (`bg-primary`) rather than raw hex values.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Raw brand scale — use sparingly, prefer semantic tokens above.
        ink: {
          50: '#F6F6F5',
          100: '#E7E7E4',
          300: '#A8A8A2',
          600: '#3D3D38',
          900: '#0B0B0B',
        },
        cream: {
          50: '#FBFAF6',
          100: '#F4F1E8',
          200: '#EAE5D6',
        },
        olive: {
          100: '#E8EBDD',
          300: '#B3BC96',
          500: '#6E7C4A',
          600: '#5F6F3E',
          700: '#4C5931',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
