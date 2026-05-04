"/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: [\"class\"],
  content: [\"./src/**/*.{js,jsx,ts,tsx}\", \"./public/index.html\"],
  theme: {
    container: { center: true, padding: \"1.5rem\", screens: { \"2xl\": \"1400px\" } },
    extend: {
      fontFamily: {
        sans: [\"Satoshi\", \"ui-sans-serif\", \"system-ui\", \"sans-serif\"],
        heading: [\"'Cabinet Grotesk'\", \"Satoshi\", \"sans-serif\"],
        mono: [\"'JetBrains Mono'\", \"ui-monospace\", \"monospace\"],
      },
      colors: {
        border: \"hsl(var(--border))\",
        input: \"hsl(var(--input))\",
        ring: \"hsl(var(--ring))\",
        background: \"hsl(var(--background))\",
        foreground: \"hsl(var(--foreground))\",
        primary: { DEFAULT: \"hsl(var(--primary))\", foreground: \"hsl(var(--primary-foreground))\" },
        secondary: { DEFAULT: \"hsl(var(--secondary))\", foreground: \"hsl(var(--secondary-foreground))\" },
        muted: { DEFAULT: \"hsl(var(--muted))\", foreground: \"hsl(var(--muted-foreground))\" },
        accent: { DEFAULT: \"hsl(var(--accent))\", foreground: \"hsl(var(--accent-foreground))\" },
        destructive: { DEFAULT: \"hsl(var(--destructive))\", foreground: \"hsl(var(--destructive-foreground))\" },
        card: { DEFAULT: \"hsl(var(--card))\", foreground: \"hsl(var(--card-foreground))\" },
        popover: { DEFAULT: \"hsl(var(--popover))\", foreground: \"hsl(var(--popover-foreground))\" },
      },
      borderRadius: {
        lg: \"var(--radius)\",
        md: \"calc(var(--radius) - 4px)\",
        sm: \"calc(var(--radius) - 6px)\",
      },
      keyframes: {
        \"fade-up\": { \"0%\": { opacity: 0, transform: \"translateY(16px)\" }, \"100%\": { opacity: 1, transform: \"translateY(0)\" } },
        float: { \"0%,100%\": { transform: \"translateY(0)\" }, \"50%\": { transform: \"translateY(-12px)\" } },
        shimmer: { \"100%\": { transform: \"translateX(100%)\" } },
        \"grid-pan\": { \"0%\": { backgroundPosition: \"0 0\" }, \"100%\": { backgroundPosition: \"40px 40px\" } },
      },
      animation: {
        \"fade-up\": \"fade-up 0.7s cubic-bezier(.22,1,.36,1) both\",
        float: \"float 6s ease-in-out infinite\",
        shimmer: \"shimmer 2.5s linear infinite\",
        \"grid-pan\": \"grid-pan 8s linear infinite\",
      },
    },
  },
  plugins: [],
};
"