import React from "react";
import { TenantProvider } from "@/contexts/TenantContext";
import { naoIndexar } from "@/lib/seo";

export const metadata = naoIndexar;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TenantProvider>{children}</TenantProvider>;
}
