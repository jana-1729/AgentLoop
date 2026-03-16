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
  title: "AgentLoop — Orchestrate Agentic Integrations",
  description:
    "AgentLoop is the integration fabric for agentic workflows. Design, connect, and scale reliable automations across your stack with built-in governance.",
  keywords: [
    "agentic workflows",
    "integration platform",
    "workflow automation",
    "SaaS infrastructure",
    "embedded integrations",
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
