import { PrefsProvider, prefsBootScript } from "@/components/prefs-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ms" data-accent="rose" data-floral="on" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsBootScript }} />
      </head>
      <body>
        <PrefsProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" richColors closeButton />
        </PrefsProvider>
      </body>
    </html>
  );
}
