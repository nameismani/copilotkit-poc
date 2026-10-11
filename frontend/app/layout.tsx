import "./globals.css";
import { Suspense } from "react";
import Providers from "./providers";
import AppShell from "./components/AppShell";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
