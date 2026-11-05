import type { Metadata, Viewport } from "next";
import { MotionRoot } from "@/components/motion";
import { Toaster } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Vybe Market: all your campus needs, in one app", template: "%s | Vybe Market" },
  description: "Buy, sell and discover products and services from student businesses on your campus.",
};
export const viewport: Viewport = { themeColor: "#070509", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh"><MotionRoot>{children}</MotionRoot><Toaster /></body>
    </html>
  );
}
