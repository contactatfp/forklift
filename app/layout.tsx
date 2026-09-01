import type { Metadata } from "next";
import { IBM_Plex_Mono, Saira_Stencil } from "next/font/google";
import "./globals.css";

const display = Saira_Stencil({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Forklift — review 300 forks before lunch",
  description: "A review engine for Solari hiring challenges. Evidence, not rankings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
