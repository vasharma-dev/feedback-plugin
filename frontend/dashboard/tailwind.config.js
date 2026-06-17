/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6C2BD9",
          50: "#F5F0FE",
          100: "#EBE0FD",
          200: "#D6C2FB",
          300: "#B795F6",
          400: "#9560EF",
          500: "#7C3AED",
          600: "#6C2BD9",
          700: "#5A1FB8",
          800: "#491C92",
          900: "#3C1A75",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        cardHover: "0 4px 12px rgba(16,24,40,.08), 0 2px 4px rgba(16,24,40,.06)",
        pop: "0 12px 32px rgba(16,24,40,.16)",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".35" },
        },
      },
      animation: {
        fadeInUp: "fadeInUp .3s ease both",
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
