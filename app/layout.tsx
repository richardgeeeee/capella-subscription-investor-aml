import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capella Alpha Fund - Investor KYC",
  description: "奕卓資本/Capella Alpha Fund - 投资者信息收集系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
