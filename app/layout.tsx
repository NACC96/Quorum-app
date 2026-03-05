import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "@/app/globals.css";
import { SessionsProvider } from "@/lib/sessions-context";

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
}>): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${serif.variable} ${inter.variable}`} suppressHydrationWarning>
        <SessionsProvider>{children}</SessionsProvider>
      </body>
    </html>
  );
}
