import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";

export const metadata: Metadata = {
  title: "Triplog — turn your trip into a private travel book",
  description: "Triplog reconstructs a completed trip from your photos, then gives you a private travel book to keep, edit, and share.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
