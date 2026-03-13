import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        obsidian:  "#0C0B09",
        charcoal:  "#141210",
        // Text
        ink:       "#EDE5D0",
        muted:     "#6E6558",
        subdued:   "#9A9085",
        // Accents
        gold:      "#C4973A",
        "gold-light": "#D4A84A",
        champagne: "#E8D5A8",
        // Legacy aliases (keep for compatibility)
        sand:      "#0C0B09",
        panel:     "#1A1712",
        accent:    "#C4973A",
        sun:       "#E8D5A8",
        olive:     "#9A9085",
        sea:       "#8A9DB8",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans:    ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        float:    "0 24px 64px rgba(0, 0, 0, 0.55)",
        gold:     "0 12px 36px rgba(196, 151, 58, 0.28)",
        "gold-sm": "0 6px 20px rgba(196, 151, 58, 0.20)",
        inner:    "inset 0 1px 0 rgba(255, 248, 235, 0.06)",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #9E7428, #C4973A, #D4A84A)",
        "dark-gradient": "linear-gradient(160deg, rgba(255,248,235,0.038), rgba(255,248,235,0.018))",
      },
      borderColor: {
        gold:        "rgba(196, 151, 58, 0.40)",
        "gold-soft": "rgba(196, 151, 58, 0.18)",
        "gold-faint":"rgba(196, 151, 58, 0.10)",
        ivory:       "rgba(237, 229, 208, 0.12)",
      },
    }
  },
  plugins: []
};

export default config;
