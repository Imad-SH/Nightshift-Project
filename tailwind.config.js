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

                // The interface accent: one blue, the navy of the hat in the Nightshift logo (900 #1b336f), and
                // its lighter shades. Hue ~216-223 so it reads blue (not lavender), and about 45-50 % saturation
                // so it stays calm for analysts who look at it all day; text shades keep readable contrast.
                // Kept under the name "cyan" so every existing cyan-* class takes it.
                cyan: {
                    50: "#f1f5fb",
                    100: "#e1e9f5",
                    200: "#c4d4ec",
                    300: "#a2bbe0",
                    400: "#83a2d4",
                    500: "#6789c6",
                    600: "#5679bb",
                    700: "#3f5d9c",
                    800: "#2e4a85",
                    900: "#1b336f",
                    950: "#0e1d42",
                },
                // Cyber Themed Colors
                cyber: {
                    black: "#0B0F19",
                    slate: "#1e293b",
                    dark: "#0F172A",
                },
                neon: {
                    cyan: "#6789c6",
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
