import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { AppStoreProvider } from "@/components/providers/app-store";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FreeLance Chain — Work Together. Trust the Blockchain.",
    template: "%s · FreeLance Chain",
  },
  description:
    "Create, accept and execute freelance service agreements secured by Ethereum smart contracts, with milestone-based escrow.",
};

export const viewport: Viewport = {
  themeColor: "#101828",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ToastProvider>
          <WalletProvider>
            <AppStoreProvider>{children}</AppStoreProvider>
          </WalletProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
