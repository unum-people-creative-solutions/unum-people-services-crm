"use client";

import { useEffect, useRef, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { X } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { TermsService, TermStatusItem } from "@/services/api";
import { logoutFromHostedUI } from "@/lib/pkce";
import { ACTIVE_TENANT_CHANGE_EVENT, ACTIVE_TENANT_KEY } from "@/lib/activeTenant";

// Tenants cujo aviso o GlobalAdmin fechou nesta aba.
const DISMISSED_NOTICE_KEY = "terms-notice-dismissed";

function getDismissedNotices(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(DISMISSED_NOTICE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

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
  return sessionStorage.getItem(ACTIVE_TENANT_KEY) || undefined;
}

// Tenant que a API usa quando a consulta sai sem tenant: o claim do token.
function getTokenTenantId(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    const decoded = jwtDecode<Record<string, unknown>>(token);
    const tenantId = decoded["custom:tenant_id"];
    return typeof tenantId === "string" && tenantId ? tenantId : undefined;
  } catch {
    return undefined;
  }
}

export default function PendingTermsGate() {
  const { logout, session } = useAuthStore();
  const [pendingItems, setPendingItems] = useState<TermStatusItem[] | null>(null);
  // Tenant usado na última consulta de status: é o dono do termo pendente e
  // o que o Portal do Cliente precisa ativar para o aceite cair no lugar certo.
  const statusTenantIdRef = useRef<string | undefined>(undefined);
  const [statusTenantId, setStatusTenantId] = useState<string | undefined>(undefined);
  const [dismissedNotices, setDismissedNotices] = useState<string[]>(getDismissedNotices);
  // Só a resposta da consulta mais recente vale: depois de uma troca de
  // tenant, a resposta atrasada do tenant anterior é descartada.
  const requestSeqRef = useRef(0);

  const fetchStatus = () => {
    const seq = ++requestSeqRef.current;
    const tenantId = getActiveTenantId();
    // Sem tenant ativo salvo a consulta sai sem tenant e a API resolve pelo
    // token; o redirecionamento leva esse mesmo tenant.
    const resolvedTenantId = tenantId ?? getTokenTenantId(session?.token);
    statusTenantIdRef.current = resolvedTenantId;
    TermsService.getStatus(tenantId)
      .then((res) => {
        if (seq !== requestSeqRef.current) return;
        setStatusTenantId(resolvedTenantId);
        setPendingItems(res.pending || []);
      })
      .catch((err) => {
        if (seq !== requestSeqRef.current) return;
        setStatusTenantId(resolvedTenantId);
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
    // O TenantContext avisa a troca de empresa: consulta na hora, sem esperar
    // o ciclo de 15 s.
    const onTenantChange = () => fetchStatus();
    window.addEventListener(ACTIVE_TENANT_CHANGE_EVENT, onTenantChange);
    return () => window.removeEventListener(ACTIVE_TENANT_CHANGE_EVENT, onTenantChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPending = pendingItems !== null && pendingItems.length > 0;
  const hasAcionavel = hasPending && pendingItems!.some((item) => item.can_accept === true);
  const hasOnlyNaoAcionavel = hasPending && !hasAcionavel;
  // GlobalAdmin não é membro das empresas dos clientes e não pode aceitar o
  // termo delas (can_accept=false): em vez de ficar preso, vê um aviso. A falha
  // da consulta continua bloqueando (fail-closed).
  const isStatusError = pendingItems?.some((item) => item.type === "error_fallback") ?? false;
  const showGlobalAdminNotice =
    hasOnlyNaoAcionavel && !isStatusError && session?.role === "GlobalAdmin";
  const noticeDismissed = dismissedNotices.includes(statusTenantId ?? "");

  const dismissNotice = () => {
    const next = [...dismissedNotices, statusTenantId ?? ""];
    setDismissedNotices(next);
    sessionStorage.setItem(DISMISSED_NOTICE_KEY, JSON.stringify(next));
  };

  // Polling de 15s se só houver itens não-acionáveis (e o aviso não foi fechado)
  const shouldPoll = hasOnlyNaoAcionavel && !(showGlobalAdminNotice && noticeDismissed);
  useEffect(() => {
    if (!shouldPoll) return;

    const intervalId = setInterval(() => {
      fetchStatus();
    }, 15000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPoll]);

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

  if (showGlobalAdminNotice) {
    if (noticeDismissed) {
      return null;
    }
    return (
      <div
        role="status"
        className="fixed bottom-4 right-4 z-[200] flex max-w-sm items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-lg"
      >
        <p>O termo de contratação desta empresa está pendente. Só um administrador da empresa pode aceitá-lo.</p>
        <button
          type="button"
          onClick={dismissNotice}
          aria-label="Fechar aviso"
          className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        >
          <X size={16} aria-hidden="true" />
        </button>
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
