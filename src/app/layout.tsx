import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TBA Credentialing",
  description: "Credentialing and enrollment operations platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
