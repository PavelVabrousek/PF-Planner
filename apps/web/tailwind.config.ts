import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0F1115",
        panel: "#151922",
        surface: "#1B2130",
        positive: "#22C55E",
        negative: "#EF4444",
        neutral: "#3B82F6",
        warning: "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["Roboto Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px rgba(0,0,0,0.24)",
      },
    },
  },
  plugins: [forms],
};

export default config;
