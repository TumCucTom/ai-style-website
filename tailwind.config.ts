import type { Config } from "tailwindcss";

const cssVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class", ".dark"],
  theme: {
    extend: {
      colors: {
        bg: cssVar("--bg-rgb"),
        surface: cssVar("--surface-rgb"),
        line: cssVar("--line-rgb"),
        ink: cssVar("--ink-rgb"),
        muted: cssVar("--muted-rgb"),
        accent: cssVar("--accent-rgb"),
      },
      fontFamily: {
        sans: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--mono)"],
        serif: ["var(--serif)"],
      },
    },
  },
  plugins: [],
};

export default config;
