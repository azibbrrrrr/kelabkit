import { PrefsProvider, prefsBootScript } from "@/components/prefs-provider";
import { isLocale, LOCALE_COOKIE, defaultLocale } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "KelabKit", template: "%s | KelabKit" },
  description: "Urus kutipan KGK dengan mudah, kemas dan teratur — tanpa perlu Excel.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#fff7f9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : defaultLocale;
  return (
    <html lang={locale} data-accent="rose" data-floral="on" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsBootScript }} />
      </head>
      <body>
        <PrefsProvider initialLocale={locale}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" richColors closeButton />
        </PrefsProvider>
      </body>
    </html>
  );
}
