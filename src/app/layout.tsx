import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const sora = Sora({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentLoop — India's Health Commerce OS",
  description:
    "AgentLoop turns every Swiggy, Instamart & Dineout order into a health decision. Set a goal—diabetes, weight, heart—and every order is scored, corrected, and delivered on target. Powered by Swiggy MCP.",
  keywords: [
    "health commerce",
    "diabetes food ordering",
    "Swiggy MCP",
    "agentic ordering",
    "healthy grocery autopilot",
    "AgentLoop",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} antialiased font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
