import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel Claims Copilot",
  description: "Know who to contact, what to ask, and what to do after a travel disruption."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
