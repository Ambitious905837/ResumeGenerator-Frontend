/** @type {import('tailwindcss').Config} */
// Colours are declared as CSS variables in index.css rather than literals, so the same
// class name resolves to the light or the dark value depending on the `dark` class on
// <html>. Anything added here must have a value in BOTH blocks of :root / .dark.
const withOpacity = (variable) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `hsl(var(${variable}))`
    : `hsl(var(${variable}) / ${opacityValue})`;

module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        bg: withOpacity('--bg'),
        surface: withOpacity('--surface'),
        'surface-2': withOpacity('--surface-2'),
        overlay: withOpacity('--overlay'),
        border: withOpacity('--border'),
        'border-strong': withOpacity('--border-strong'),
        input: withOpacity('--input'),
        ring: withOpacity('--ring'),
        fg: withOpacity('--fg'),
        muted: withOpacity('--muted'),
        subtle: withOpacity('--subtle'),
        brand: {
          DEFAULT: withOpacity('--brand'),
          fg: withOpacity('--brand-fg'),
          soft: withOpacity('--brand-soft'),
          hover: withOpacity('--brand-hover'),
        },
        success: {
          DEFAULT: withOpacity('--success'),
          fg: withOpacity('--success-fg'),
          soft: withOpacity('--success-soft'),
        },
        warning: {
          DEFAULT: withOpacity('--warning'),
          fg: withOpacity('--warning-fg'),
          soft: withOpacity('--warning-soft'),
        },
        danger: {
          DEFAULT: withOpacity('--danger'),
          fg: withOpacity('--danger-fg'),
          soft: withOpacity('--danger-soft'),
        },
        info: {
          DEFAULT: withOpacity('--info'),
          fg: withOpacity('--info-fg'),
          soft: withOpacity('--info-soft'),
        },
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        xs: '0 1px 2px 0 hsl(var(--shadow) / 0.05)',
        sm: '0 1px 3px 0 hsl(var(--shadow) / 0.08), 0 1px 2px -1px hsl(var(--shadow) / 0.06)',
        md: '0 4px 12px -2px hsl(var(--shadow) / 0.10), 0 2px 6px -2px hsl(var(--shadow) / 0.06)',
        lg: '0 12px 28px -8px hsl(var(--shadow) / 0.18), 0 4px 10px -4px hsl(var(--shadow) / 0.08)',
        pop: '0 16px 40px -12px hsl(var(--shadow) / 0.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
