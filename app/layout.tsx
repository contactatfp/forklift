import type { Metadata } from "next";
import { Caveat, IBM_Plex_Mono, Saira_Stencil } from "next/font/google";
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

const sketch = Caveat({
  variable: "--font-sketch",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Forklift — review 300 forks before lunch",
  description: "Paste a challenge repo. Five forks run at once. Open a card when a bay goes green.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${sketch.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
