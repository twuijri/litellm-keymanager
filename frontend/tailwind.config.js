/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0d12",
          900: "#11141b",
          800: "#171b24",
          700: "#222837",
          600: "#2d3445",
          500: "#3f4759",
          300: "#9aa3b7",
          200: "#c7cdde",
        },
        accent: {
          500: "#7c5cff",
          400: "#9a82ff",
          300: "#c4b5ff",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
