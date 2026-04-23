import type { Metadata } from "next";
import "./globals.css";
import { DialogProvider } from "@/components/Dialog";

export const metadata: Metadata = {
  title: "Capella Alpha Fund - Investor KYC",
  description: "奕卓資本/Capella Alpha Fund - 投资者信息收集系统",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
