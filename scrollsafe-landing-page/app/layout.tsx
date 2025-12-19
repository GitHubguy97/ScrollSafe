
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ScrollSafe | Spot Likely AI-Generated Videos",
  description: "A professional Chrome extension to identify AI-generated video content while you scroll. Privacy-first, lightweight, and trustworthy.",
  keywords: ["AI detection", "Deepfake detection", "Chrome extension", "Video verification", "ScrollSafe"],
  openGraph: {
    title: "ScrollSafe | Spot Likely AI-Generated Videos",
    description: "Identify likely AI content while you browse with a subtle transparency layer.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} bg-white text-slate-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
