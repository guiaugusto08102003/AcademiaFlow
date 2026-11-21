import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "AcademiaFlow",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "AcademiaFlow", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#14231c", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-paper text-forest-900 antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
