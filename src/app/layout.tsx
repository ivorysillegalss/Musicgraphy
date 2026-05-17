import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Poppins, Righteous, JetBrains_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

const poppins = Poppins({ 
  subsets: ["latin"], 
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins" 
});

const righteous = Righteous({ 
  subsets: ["latin"], 
  weight: "400",
  variable: "--font-righteous" 
});

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
    <html lang="en" className={`${poppins.variable} ${righteous.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased text-primary selection:bg-[rgba(34,197,94,0.3)] selection:text-white" style={{ background: "var(--color-background)", color: "var(--color-text)" }}>
        <LanguageProvider>
          {children}
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: "var(--bg-elevated)",
                color: "var(--color-text)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                fontFamily: "var(--font-poppins)",
              },
            }}
          />
        </LanguageProvider>
      </body>
    </html>
  );
}
