/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: "hsl(var(--card))",
                "card-foreground": "hsl(var(--card-foreground))",
                popover: "hsl(var(--popover))",
                "popover-foreground": "hsl(var(--popover-foreground))",
                primary: "hsl(var(--primary))",
                "primary-foreground": "hsl(var(--primary-foreground))",
                secondary: "hsl(var(--secondary))",
                "secondary-foreground": "hsl(var(--secondary-foreground))",
                muted: "hsl(var(--muted))",
                "muted-foreground": "hsl(var(--muted-foreground))",
                accent: "hsl(var(--accent))",
                "accent-foreground": "hsl(var(--accent-foreground))",
                destructive: "hsl(var(--destructive))",
                "destructive-foreground": "hsl(var(--destructive-foreground))",
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",

                cyan: {
                    50: "#ecfdfd",
                    100: "#cffafe",
                    200: "#a5f3fc",
                    300: "#64f8f4",
                    400: "#32f5ef",
                    500: "#00f2ea", // The exact login color
                    600: "#00dad3",
                    700: "#00c2bc",
                    800: "#00aba5",
                    900: "#004e4c",
                    950: "#003230",
                },
                // Cyber Themed Colors
                cyber: {
                    black: "#0B0F19",
                    slate: "#1e293b",
                    dark: "#0F172A",
                },
                neon: {
                    cyan: "#00f2ea",
                    green: "#22c55e",
                    red: "#f43f5e",
                    amber: "#f59e0b",
                }
            },
            fontFamily: {
                mono: ["JetBrains Mono", "Menlo", "Monaco", "Courier New", "monospace"],
                sans: ["Outfit", "Inter", "system-ui", "sans-serif"],
                outfit: ["Outfit", "sans-serif"],
            },
            animation: {
                "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "scanline": "scanline 8s linear infinite",
                "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            },
            keyframes: {
                "pulse-glow": {
                    "0%, 100%": { opacity: 1, boxShadow: "0 0 5px currentColor" },
                    "50%": { opacity: .5, boxShadow: "0 0 20px currentColor" },
                },
                "scanline": {
                    "0%": { transform: "translateY(-100%)" },
                    "100%": { transform: "translateY(100%)" },
                }
            }
        },
    },
    plugins: [],
}
