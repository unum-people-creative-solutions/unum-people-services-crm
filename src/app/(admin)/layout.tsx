import React from "react";
import { TenantProvider } from "@/contexts/TenantContext";
import { AcessosProvider } from "@/contexts/AcessosContext";
import { naoIndexar } from "@/lib/seo";

export const metadata = naoIndexar;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <AcessosProvider>{children}</AcessosProvider>
    </TenantProvider>
  );
}
