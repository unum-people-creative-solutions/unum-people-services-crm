"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { jwtDecode } from "jwt-decode";
import PendingTermsGate from "./PendingTermsGate";
import TelaDeBloqueioCobranca from "./TelaDeBloqueioCobranca";
import { redirectToHostedUI } from "@/lib/pkce";
import { CobrancaService, EVENTO_COBRANCA_BLOQUEADA } from "@/services/api";
import { ACTIVE_TENANT_CHANGE_EVENT, ACTIVE_TENANT_KEY } from "@/lib/activeTenant";
import type { ResumoDeCobranca } from "@/types/cobranca";

// Empresa ativa fora do TenantProvider: sessionStorage "active-tenant" e, sem
// ela, o custom:tenant_id do token (mesma regra do PendingTermsGate).
function empresaAtiva(token: string | undefined): string | undefined {
  if (typeof window === "undefined") return undefined;
  const salva = sessionStorage.getItem(ACTIVE_TENANT_KEY);
  if (salva) return salva;
  if (!token) return undefined;
  try {
    const decoded = jwtDecode<Record<string, unknown>>(token);
    const tenantId = decoded["custom:tenant_id"];
    return typeof tenantId === "string" && tenantId ? tenantId : undefined;
  } catch {
    return undefined;
  }
}

interface CobrancaLida {
  tenantId: string | undefined;
  resumo: ResumoDeCobranca | null;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, session, logout } = useAuthStore();
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);

  // Resumo de cobrança da empresa ativa (cobranca-e-plano-do-cliente RF2-53).
  // `null` = ainda não lido nesta carga.
  const [cobranca, setCobranca] = useState<CobrancaLida | null>(null);
  const [erroCobranca, setErroCobranca] = useState(false);
  // Empresa em que a tela de bloqueio foi mostrada: ela fica até a troca de
  // empresa ou o "Continuar" (recarrega), para mostrar "Pagamento confirmado".
  const [telaDaEmpresa, setTelaDaEmpresa] = useState<string | null>(null);
  const tokenRef = useRef(session?.token);
  tokenRef.current = session?.token;
  const leituraRef = useRef(0);
  const pedidaRef = useRef<string | undefined>(undefined);
  const lidaRef = useRef<string | undefined>(undefined);


  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
    });

    if (useAuthStore.persist.hasHydrated()) {
      setIsHydrated(true);
    }

    return () => unsub();
  }, []);

  const publicPaths = ["/", "/auth/callback"];
  const isPublicPath = publicPaths.includes(pathname);

  useEffect(() => {
    if (isHydrated) {
      // Verificar se o caminho é público
      if (!isPublicPath) {
        if (!isAuthenticated || !session?.token) {
          void redirectToHostedUI(pathname);
          return;
        }

        // 3. Validação de expiração do Token
        try {
          const decoded: any = jwtDecode(session.token);
          const currentTime = Date.now() / 1000;

          if (decoded.exp < currentTime) {
            console.warn("Sessão expirada. Redirecionando...");
            logout();
            void redirectToHostedUI(pathname);
            return;
          }
        } catch (err) {
          logout();
          void redirectToHostedUI(pathname);
          return;
        }

      }
    }
  }, [isHydrated, isAuthenticated, session, pathname, isPublicPath, logout]);

  // Só a leitura mais recente vale: a resposta atrasada da empresa anterior é
  // descartada. Rejeita na falha, para a espera do pagamento contar as falhas.
  const lerCobranca = useCallback((): Promise<void> => {
    const leitura = ++leituraRef.current;
    const tenantId = empresaAtiva(tokenRef.current);
    pedidaRef.current = tenantId;
    if (!tenantId) {
      lidaRef.current = undefined;
      setCobranca({ tenantId: undefined, resumo: null });
      setErroCobranca(false);
      return Promise.resolve();
    }
    return CobrancaService.resumo(tenantId).then(
      (resumo) => {
        if (leitura !== leituraRef.current) return;
        const trocouDeEmpresa = lidaRef.current !== tenantId;
        lidaRef.current = tenantId;
        setCobranca({ tenantId, resumo });
        setErroCobranca(false);
        if (resumo.ferramentas_bloqueadas.includes("crm")) {
          setTelaDaEmpresa(tenantId);
        } else if (trocouDeEmpresa) {
          setTelaDaEmpresa(null);
        }
      },
      (err) => {
        if (leitura === leituraRef.current) {
          console.error(
            "Erro ao conferir a situação da conta:",
            err?.response?.status ?? err?.message ?? "erro desconhecido"
          );
          if (lidaRef.current !== tenantId) {
            lidaRef.current = tenantId;
            setCobranca({ tenantId, resumo: null });
          }
          setErroCobranca(true);
        }
        throw err;
      }
    );
  }, []);

  // O operador (GlobalAdmin) não vê a tela de bloqueio: a API também o libera
  // (DV-14 revista em 11/11/2026).
  const consultaCobranca =
    isHydrated && !isPublicPath && isAuthenticated && !!session?.token && session.role !== "GlobalAdmin";

  useEffect(() => {
    if (!consultaCobranca) return;
    // A falha já aparece na tela (erroCobranca, UI-4); o catch só evita a
    // rejeição solta.
    const ler = () => {
      lerCobranca().catch(() => {});
    };
    ler();
    // O TenantProvider avisa toda troca (inclusive a escolha ao montar): só a
    // empresa diferente da última pedida é relida.
    const aoTrocarEmpresa = () => {
      if (empresaAtiva(tokenRef.current) === pedidaRef.current) return;
      ler();
    };
    // Segunda barreira: 403 com motivo "cobranca" em qualquer chamada do CRM.
    const aoBloquear = () => {
      const tenantId = empresaAtiva(tokenRef.current);
      if (!tenantId) return;
      setTelaDaEmpresa(tenantId);
      ler();
    };
    window.addEventListener(ACTIVE_TENANT_CHANGE_EVENT, aoTrocarEmpresa);
    window.addEventListener(EVENTO_COBRANCA_BLOQUEADA, aoBloquear);
    return () => {
      window.removeEventListener(ACTIVE_TENANT_CHANGE_EVENT, aoTrocarEmpresa);
      window.removeEventListener(EVENTO_COBRANCA_BLOQUEADA, aoBloquear);
    };
  }, [consultaCobranca, lerCobranca]);

  // SUG-8 (/local-review): a busca do Termo de Contratação de Serviço vive
  // num efeito à parte, sem `pathname`/`session`/`router` nas deps (só o que
  // realmente muda o resultado) — evita refazer a chamada de API a cada troca
  // de rota dentro da área autenticada (alinhado ao padrão já usado no
  // blog-admin). Independente do consentimento LGPD acima (gate separado, ver
  // HANDOFF-fase5.md). O backend decide can_accept a partir do papel real do
  // JWT; o frontend nunca infere. Fail-closed: se a busca falhar, tratamos
  // como pendente/sem permissão de aceite (tela de espera) em vez de liberar
  // o acesso — nunca assumir "sem gate" só porque não conseguimos confirmar
  // o status.


  // BUG DE PRODUÇÃO (2026-07): sem essa trava, `children` sempre renderizava
  // assim que hidratado, mesmo sem sessão válida em rota privada — em rotas
  // que não existem mais (ex.: a extinta /login), isso deixava o 404 real do
  // Next.js visível enquanto o redirect assíncrono pro Hosted UI ainda não
  // completava (mesmo padrão já usado no AuthGuard do blog-admin).
  if (!isHydrated || (!isPublicPath && (!isAuthenticated || !session?.token))) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div role="status" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (consultaCobranca) {
    // UI-3: até o resumo chegar, nenhuma tela do CRM monta (nenhuma chamada sai
    // para gerar 403).
    if (cobranca === null) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-50">
          <div role="status" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      );
    }
    // Tela no lugar de children e sem o PendingTermsGate (BP-T §8.3).
    if (telaDaEmpresa !== null && telaDaEmpresa === cobranca.tenantId) {
      return <TelaDeBloqueioCobranca tenantId={telaDaEmpresa} resumo={cobranca.resumo} recarregar={lerCobranca} />;
    }
  }

  return (
    <>
      {consultaCobranca && erroCobranca && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 z-[150] flex max-w-sm items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-lg"
        >
          <p>Não conseguimos conferir a situação da conta agora.</p>
          <button
            type="button"
            onClick={() => {
              lerCobranca().catch(() => {});
            }}
            className="shrink-0 font-semibold underline hover:text-amber-950"
          >
            Tentar de novo
          </button>
        </div>
      )}
      {children}
      {!isPublicPath && isAuthenticated && <PendingTermsGate />}
    </>
  );
}
