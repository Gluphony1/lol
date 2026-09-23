import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Luma",
  title: "Luma — Find your frequency",
  description: "Discover original artists, albums, and late-night soundscapes with Luma.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Luma",
  },
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
