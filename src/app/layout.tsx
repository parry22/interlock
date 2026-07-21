import type { Metadata } from "next";
import { DM_Sans, Ancizar_Serif } from "next/font/google";
import { ShellLayout } from "@/components/ShellLayout";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const ancizar = Ancizar_Serif({
  variable: "--font-ancizar",
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Interlock",
  description: "AI Pricing Platform",
  icons: {
    icon: "/logomark.png",
    apple: "/logomark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${ancizar.variable} h-full`}>
      <body className={`flex h-screen overflow-hidden bg-[#070707] antialiased font-[family-name:var(--font-dm-sans)] ${ancizar.variable}`}>
        <ShellLayout>{children}</ShellLayout>
      </body>
    </html>
  );
}
