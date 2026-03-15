import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Inter, JetBrains_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
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
    <html lang="en" className={`${inter.variable} ${jbMono.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground tracking-wide">
        <LanguageProvider>
          {children}
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
