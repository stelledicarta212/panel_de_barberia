import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "BarberAgency Dashboard",
  description: "Dashboard SaaS para barberias"
};

const themeBootstrap = `
(() => {
  try {
    const raw = localStorage.getItem("ba_theme");
    const theme = raw === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
