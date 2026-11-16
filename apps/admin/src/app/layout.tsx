import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = { title: "Embryo Console", robots: { index: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <div className="brand">embryo</div>
            <div className="sub">Operations &amp; compliance</div>
            <Link href="/">Overview</Link>
            <Link href="/users">Users &amp; KYC</Link>
            <Link href="/batches">Settlement</Link>
            <Link href="/countries">Country policy</Link>
            <Link href="/audit">Audit log</Link>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
