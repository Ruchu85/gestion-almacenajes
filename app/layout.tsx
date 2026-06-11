import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "GestiPuertos - Gestión de Costes de Almacenaje",
    template: "%s | GestiPuertos",
  },
  description:
    "Plataforma SaaS para gestión profesional de entradas, salidas y costes de almacenaje de mercancías.",
  keywords: ["almacenaje", "gestión", "costes", "logística", "almacén"],
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
