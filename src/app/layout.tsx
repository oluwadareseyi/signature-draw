import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Instrument_Serif } from "next/font/google";
import { Dancing_Script } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
});
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-signature",
});

export const metadata: Metadata = {
  title: "Signature Draw",
  description: "Draw and verify your signature for document signing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${instrumentSerif.variable} ${dancingScript.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
