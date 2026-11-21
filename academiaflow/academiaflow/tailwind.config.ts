import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    paper: "#f3f5ef",
    forest: { 900: "#14231c", 700: "#24402f" },
    lime: { 400: "#c6f432" },
  } } },
  plugins: [],
} satisfies Config;
