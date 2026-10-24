import type { Metadata } from "next";
import "./globals.css";
import "./admin.css";
import "./consumer.css";

export const metadata: Metadata = {
  title: "Axia Rewards | A brighter return on solar",
  description: "Redeem your Axia solar rebate, track your reward, and manage the Rebate & Referral Program.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
