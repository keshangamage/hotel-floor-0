import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Walk a hotel corridor and decide whether anything has changed since the last one. "
  + "Five floors down, one wrong answer costs the run.";

export const metadata: Metadata = {
  title: "Hotel Floor 0",
  description: DESCRIPTION,
  // Without these a shared link unfurls blank, which for a game that spreads
  // by being shared is most of its reach.
  openGraph: {
    title: "Hotel Floor 0",
    description: DESCRIPTION,
    type: "website",
    siteName: "Hotel Floor 0",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hotel Floor 0",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  // The game owns the viewport; zoom and scroll would fight pointer lock.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Extensions inject attributes onto <html> before hydration. Applies one
      // level deep only, so real mismatches inside the app still surface.
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden bg-black text-neutral-200">
        {children}
      </body>
    </html>
  );
}
