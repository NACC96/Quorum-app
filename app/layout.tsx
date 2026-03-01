import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "@/app/globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif"
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

export const metadata: Metadata = {
  title: "Quorum",
  description: "Council-style multi-model deliberation with a final judge verdict."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${inter.variable}`}>{children}</body>
    </html>
  );
}
