import React from "react";
import Link from "next/link";
import { AppProvider } from "./context/AppContext";
import { TierBadgeInner } from "./components/TierBadge";
import "./globals.css";

export const metadata = {
  title: "Career Copilot",
  description: "Your unified career preparation dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body>
        <AppProvider>
          <header
            style={{
              background: "#fff",
              borderBottom: "1px solid #e5e7eb",
              position: "sticky",
              top: 0,
              zIndex: 100,
            }}
          >
            <nav
              style={{
                maxWidth: "1040px",
                margin: "0 auto",
                padding: "0 1.5rem",
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <Link
                href="/today"
                style={{
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  color: "#4f46e5",
                  letterSpacing: "-0.5px",
                  flexShrink: 0,
                }}
              >
                Career Copilot
              </Link>
              <ul
                style={{
                  display: "flex",
                  listStyle: "none",
                  gap: "0.1rem",
                  flex: 1,
                }}
              >
                {[
                  { href: "/today", label: "Today" },
                  { href: "/exams", label: "Exams" },
                  { href: "/study", label: "Study" },
                  { href: "/community", label: "Community" },
                  { href: "/marketplace", label: "Marketplace" },
                  { href: "/profile", label: "Profile" },
                ].map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      style={{
                        display: "block",
                        padding: "0.4rem 0.65rem",
                        borderRadius: "8px",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        color: "#374151",
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div style={{ flexShrink: 0 }}>
                <TierBadgeInner />
              </div>
            </nav>
          </header>
          <main>{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}
