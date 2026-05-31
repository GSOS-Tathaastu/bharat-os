/** @type {import('tailwindcss').Config} */
// Phase 11.0 — design tokens locked per ADR 0115.
// Tricolour-inspired: flag colors as ACCENTS, not splashes. Must not
// look like a government app — keep generous whitespace + modern
// typography.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface
        background: '#FFFFFF',
        surface: '#FAFAFA',
        // Brand
        primary: {
          DEFAULT: '#FF9933',          // flag-grade saffron
          50: '#FFF5EB',
          100: '#FFE7CD',
          200: '#FFCE9A',
          500: '#FF9933',
          600: '#E58020',
          700: '#B86518'
        },
        trust: {
          DEFAULT: '#138808',          // flag-grade green
          50: '#E8F5E8',
          100: '#C5E5C5',
          500: '#138808',
          600: '#0E6D06',
          700: '#0B5A05'
        },
        governance: {
          DEFAULT: '#000080',          // navy — regulated flows
          50: '#E5E5FF',
          100: '#B8B8FF',
          500: '#000080',
          600: '#000066'
        },
        // Text
        text: {
          DEFAULT: '#1A1A1A',
          muted: '#6B7280',
          inverted: '#FFFFFF'
        },
        // Utility
        border: '#E5E7EB',
        error: '#DC2626',
        warning: '#F59E0B'
      },
      fontFamily: {
        sans: ['"Manrope"', 'system-ui', 'sans-serif'],
        devanagari: ['"Noto Sans Devanagari"', 'sans-serif'],
        tamil: ['"Noto Sans Tamil"', 'sans-serif'],
        bengali: ['"Noto Sans Bengali"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      fontSize: {
        // Locked 6-step scale per ADR 0115
        caption: ['12px', { lineHeight: '16px' }],
        body: ['14px', { lineHeight: '20px' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        heading: ['20px', { lineHeight: '28px' }],
        display: ['28px', { lineHeight: '36px' }],
        hero: ['36px', { lineHeight: '44px' }]
      },
      fontWeight: {
        // Locked 2 weights
        regular: '400',
        semibold: '600'
      },
      spacing: {
        // Locked 7-step scale
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '12': '48px'
      },
      borderRadius: {
        // Locked 3 sizes
        sm: '6px',
        md: '12px',
        lg: '18px'
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        elevated: '0 4px 12px -2px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
};
