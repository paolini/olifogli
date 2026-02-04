import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import SessionProviderWrapper from "./components/SessionProviderWrapper"
import { ConfigProvider } from "./components/ConfigProvider"

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "olifogli",
  description: "description not provided",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const serverName = process.env["SERVER_NAME"]  || "Olifogli";
  const serverBackgroundColor = process.env["SERVER_BACKGROUND_COLOR"];
  const appInstance = process.env["APP_INSTANCE"];

  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
          <ConfigProvider serverName={serverName} serverBackgroundColor={serverBackgroundColor} appInstance={appInstance}>
            <SessionProviderWrapper>
              {children}
            </SessionProviderWrapper>
          </ConfigProvider>
      </body>
    </html>
  );
}
