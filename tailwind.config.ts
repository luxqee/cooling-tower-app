import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Industrial slate base
        slate: {
          950: "#0a0e14",
          900: "#0f1419",
          850: "#151a21",
          800: "#1c232c",
          750: "#242c37",
          700: "#2d3744",
          600: "#3d4a5c",
          500: "#5a6b80",
          400: "#7d8ea3",
          300: "#a3b3c7",
          200: "#c8d3e0",
          100: "#e4ebf2",
          50: "#f4f7fa",
        },
        // Amber accent - high visibility, trade-credible
        amber: {
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      fontSize: {
        "2xs": "0.6875rem", // 11px
      },
    },
  },
  plugins: [],
};

export default config;
