import React from "react";
import { TenantProvider } from "@/contexts/TenantContext";
import { AcessosProvider } from "@/contexts/AcessosContext";
import { naoIndexar } from "@/lib/seo";

export const metadata = naoIndexar;

export default function DashboardLayout({
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
