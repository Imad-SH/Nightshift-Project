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

                // The interface accent: the Nightshift / BlueSec blues (700 #475ea8, 900 #233987, 950 #111d54),
                // with lighter tints that stay readable on the dark background. Kept under the name "cyan"
                // so every existing cyan-* class takes the brand colour.
                cyan: {
                    50: "#f1f4fd",
                    100: "#e2e8fb",
                    200: "#c9d4f7",
                    300: "#a9bbf3",
                    400: "#8aa2ee",
                    500: "#6f8be6",
                    600: "#617ddb",
                    700: "#475ea8",
                    800: "#36498f",
                    900: "#233987",
                    950: "#111d54",
                },
                // Cyber Themed Colors
                cyber: {
                    black: "#0B0F19",
                    slate: "#1e293b",
                    dark: "#0F172A",
                },
                neon: {
                    cyan: "#6f8be6",
                    green: "#22c55e",
                    red: "#f43f5e",
                    amber: "#f59e0b",
                }
            },
            fontFamily: {
                mono: ["JetBrains Mono", "Menlo", "Monaco", "Courier New", "monospace"],
                sans: ["Geist", "Segoe UI", "system-ui", "sans-serif"],
                // former display font: now the same typeface as the rest of the interface
                outfit: ["Geist", "Segoe UI", "system-ui", "sans-serif"],
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
