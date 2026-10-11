"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { TermsService, TermStatusItem } from "@/services/api";
import { logoutFromHostedUI } from "@/lib/pkce";

// Lê o tenant ativo direto do sessionStorage (mesma chave usada por
// TenantContext.tsx, "active-tenant") em vez de useTenant(): este
// componente é renderizado como irmão de `children` dentro do AuthGuard
// (layout raiz), fora de qualquer TenantProvider (que só existe dentro
// de (dashboard)/(admin)) — useTenant() aqui sempre lançaria "must be
// used within a TenantProvider". sessionStorage é a fonte compartilhada
// real, então isso reflete corretamente qualquer troca feita pelo
// TenantSwitcher em outra parte da árvore.
function getActiveTenantId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem("active-tenant") || undefined;
}

export default function PendingTermsGate() {
  const { logout } = useAuthStore();
  const [pendingItems, setPendingItems] = useState<TermStatusItem[] | null>(null);
  // Tenant usado na última consulta de status: é o dono do termo pendente e
  // o que o Portal do Cliente precisa ativar para o aceite cair no lugar certo.
  const statusTenantIdRef = useRef<string | undefined>(undefined);

  const fetchStatus = () => {
    const tenantId = getActiveTenantId();
    statusTenantIdRef.current = tenantId;
    TermsService.getStatus(tenantId)
      .then((res) => {
        setPendingItems(res.pending || []);
      })
      .catch((err) => {
        console.error(
          "Erro ao carregar status dos termos:",
          err?.response?.status ?? err?.message ?? "erro desconhecido"
        );
        // Tratar como pendente/não-acionável (fail-closed)
        setPendingItems([
          {
            type: "error_fallback",
            term_id: "error",
            term_name: "Erro ao verificar termos",
            required_version: 0,
            can_accept: false,
            document_url: "",
          },
        ]);
      });
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPending = pendingItems !== null && pendingItems.length > 0;
  const hasAcionavel = hasPending && pendingItems!.some((item) => item.can_accept === true);
  const hasOnlyNaoAcionavel = hasPending && !hasAcionavel;

  // Polling de 15s se só houver itens não-acionáveis
  useEffect(() => {
    if (!hasOnlyNaoAcionavel) return;

    const intervalId = setInterval(() => {
      fetchStatus();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [hasOnlyNaoAcionavel]);

  const handleBackToLogin = () => {
    logout();
    logoutFromHostedUI();
  };

  const handleGoToCustomers = () => {
    const customersUrl =
      process.env.NEXT_PUBLIC_CUSTOMERS_URL || "https://customer.unumpeople.com.br";
    const returnTo = window.location.href;
    const tenantParam = statusTenantIdRef.current
      ? `&tenant_id=${encodeURIComponent(statusTenantIdRef.current)}`
      : "";
    window.location.href = `${customersUrl}?return_to=${encodeURIComponent(returnTo)}${tenantParam}`;
  };

  if (pendingItems === null) {
    return null;
  }

  if (pendingItems.length === 0) {
    return null;
  }

  if (hasAcionavel) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/80 backdrop-blur-md p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
          <h2 className="text-xl font-bold mb-2 text-gray-900">Você tem termos pendentes</h2>
          <p className="text-sm text-gray-600 mb-6">
            Para continuar utilizando o sistema, você precisa aceitar os novos termos e políticas de uso no Portal do Cliente.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoToCustomers}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition duration-200"
            >
              Ir para o Portal do Cliente
            </button>
            <button
              onClick={handleBackToLogin}
              className="mt-2 text-sm font-semibold text-gray-600 underline hover:text-gray-700 block mx-auto"
            >
              Sair e voltar para o login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Se só tem itens não-acionáveis (can_accept === false)
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/80 backdrop-blur-md p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Aguardando aceite do Termo de Contratação</h2>
        <p className="text-sm text-gray-600">
          O administrador da sua conta ainda não aceitou o Termo de Contratação de Serviço. Assim que isso
          acontecer, você poderá continuar normalmente.
        </p>
        <button
          onClick={handleBackToLogin}
          className="mt-6 text-sm font-semibold text-primary-600 underline hover:text-primary-700 block mx-auto"
        >
          Sair e voltar para o login
        </button>
      </div>
    </div>
  );
}
