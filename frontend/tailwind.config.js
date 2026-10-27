/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        // iPad portrait and most tablets
        tablet: '768px',
        // iPad landscape / small laptops
        desktop: '1024px',
      },
    },
  },
  plugins: [],
};
