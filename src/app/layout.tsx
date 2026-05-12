import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Outfit, Playfair_Display, JetBrains_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jb-mono" });

export const metadata: Metadata = {
  title: "Personal Music Geography & Timeline",
  description: "Map your listening history across geography and time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${playfair.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-[#0c0c0c] text-[#ece8e1]">
        <LanguageProvider>
          {children}
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: "#1c1c1c",
                color: "#ece8e1",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "12px",
                fontFamily: "var(--font-outfit)",
              },
            }}
          />
        </LanguageProvider>
      </body>
    </html>
  );
}
