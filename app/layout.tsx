import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Reel Rhythm",
  description: "A calm publishing and analytics tracker for Instagram reels.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
