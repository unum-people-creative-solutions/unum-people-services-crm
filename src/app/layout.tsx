import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "@/app/globals.css";
import AuthGuard from "@/components/AuthGuard";
import CookieBanner from "@/components/CookieBanner";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
  variable: "--font-poppins",
});

export const viewport: Viewport = {
  themeColor: "#0A1C82", // Updated to brand-blue
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "CRM | Unum People",
  description: "Receba os contatos da sua página, acompanhe cada um até virar cliente e seja avisado no celular.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Unum CRM",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`antialiased font-sans bg-white text-gray-900 ${poppins.variable}`}>
        <AuthGuard>
          {children}
        </AuthGuard>
        <CookieBanner />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                console.log('[SW] Tentando registro imediato...');
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .then(function(reg) {
                    console.log('[SW] Registro concluído com sucesso no escopo:', reg.scope);
                  })
                  .catch(function(err) {
                    console.error('[SW] Falha no registro:', err);
                  });
              } else {
                console.warn('[SW] Service Workers não são suportados neste navegador.');
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
