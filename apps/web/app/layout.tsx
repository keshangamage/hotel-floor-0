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

export const metadata: Metadata = {
  title: "Hotel Floor 0",
  description:
    "A first-person psychological horror game set in a hotel that should not have a ground floor.",
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
