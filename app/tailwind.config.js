/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontSize: {
        // Sectie 2.2: basis 20px, sleutelgegevens 28-32px, nooit kleiner dan 16px.
        base: ['20px', '28px'],
        sm: ['18px', '26px'],
        xs: ['16px', '24px'],
        lg: ['22px', '30px'],
        xl: ['26px', '34px'],
        '2xl': ['28px', '36px'],
        '3xl': ['32px', '40px'],
        '4xl': ['40px', '48px'],
        '5xl': ['52px', '58px'],
      },
      colors: {
        ink: '#111111',
        muted: '#3A3A3A',
        line: '#767676',
        paper: '#FFFFFF',
        shell: '#F2F2F2',
        brand: '#0B4F9E',
        brandDark: '#08386F',
        ok: '#0F6D31',
        warn: '#8A5300',
        danger: '#B3261E',
      },
      minHeight: { touch: '56px' },
      minWidth: { touch: '56px' },
    },
  },
  plugins: [],
}
