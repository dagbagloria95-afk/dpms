import type { Config } from "tailwindcss";

// Les couleurs sont des variables CSS (globals.css) : un seul endroit pour
// le thème clair et le thème sombre.
// color-mix permet les opacités Tailwind (ex. bg-critical/10) sur des variables hex.
const v = (name: string) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: v("page"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        ink: v("ink"),
        "ink-2": v("ink-2"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        "accent-ink": v("accent-ink"),
        zebra: v("series-1"),
        dw: v("series-2"),
        good: v("good"),
        warning: v("warning"),
        critical: v("critical"),
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
