import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: "#FEFCE8",
          100: "#FAF6F0",
          200: "#F5EDD8",
          300: "#EDE1C4",
          DEFAULT: "#FAF6F0",
        },
        gold: {
          50: "#FDF8EC",
          100: "#F9EFD0",
          200: "#F0D98A",
          300: "#E2C048",
          400: "#C9A84C",
          500: "#B8860B",
          600: "#A07830",
          700: "#8A6420",
          800: "#6B4E10",
          900: "#4A3608",
          DEFAULT: "#C9A84C",
        },
        cream: "#FAF6F0",
        parchment: "#F5EDD8",
        charcoal: "#2C2C2C",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        serif: ["Playfair Display", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        "gradient-ivory": "linear-gradient(135deg, #FAF6F0 0%, #F5EDD8 100%)",
        "gradient-gold": "linear-gradient(135deg, #C9A84C 0%, #B8860B 100%)",
      },
      boxShadow: {
        gold: "0 4px 24px rgba(201, 168, 76, 0.15)",
        "gold-lg": "0 8px 40px rgba(201, 168, 76, 0.25)",
        card: "0 2px 16px rgba(44, 44, 44, 0.06)",
        "card-hover": "0 8px 32px rgba(44, 44, 44, 0.12)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
