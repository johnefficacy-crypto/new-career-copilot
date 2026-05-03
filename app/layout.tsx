import React from "react";
import { AppProvider } from "./context/AppContext";
import "./globals.css";

export const metadata = {
  title: "Career Copilot",
  description: "Your unified career preparation dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="cc-body">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
