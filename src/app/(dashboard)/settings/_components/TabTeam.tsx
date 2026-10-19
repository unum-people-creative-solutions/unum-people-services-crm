"use client";

import { Users, ExternalLink } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

// gestao-de-acesso-f3-portal-cliente RF-21: a equipe é gerida no Portal do Cliente (a equipe antiga do CRM saiu na fase 5).
export default function TabTeam() {
  const { activeTenantId } = useTenant();
  const base =
    process.env.NEXT_PUBLIC_CUSTOMERS_URL || "https://customer.unumpeople.com.br";
  const href =
    `${base}/usuarios` +
    (activeTenantId ? `?tenant_id=${encodeURIComponent(activeTenantId)}` : "");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Users className="text-brand-blue" size={24} />
            A equipe agora fica no Portal do Cliente
          </h2>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Lá você convida pessoas e escolhe o que cada uma pode fazer no CRM, no Blog e nas Páginas.
          </p>
        </div>
        <a
          href={href}
          className="bg-gray-900 text-white rounded-xl font-bold px-6 py-3 text-sm hover:bg-black transition-all flex items-center gap-2"
        >
          Abrir Usuários no Portal
          <ExternalLink size={18} aria-hidden />
        </a>
      </div>
    </div>
  );
}
