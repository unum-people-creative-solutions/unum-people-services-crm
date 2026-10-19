"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";
import { useAuthStore } from "@/store/authStore";
import { TenantService } from "@/services/api";
import {
  exchangeCodeForTokens,
  redirectToHostedUI,
  PKCE_VERIFIER_STORAGE_KEY,
  AUTH_RETURN_TO_STORAGE_KEY,
} from "@/lib/pkce";
import { RefreshCw, XCircle } from "lucide-react";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Concluindo login...");
  const hasExecuted = useRef(false);

  useEffect(() => {
    if (hasExecuted.current) return;
    hasExecuted.current = true;

    const code = searchParams.get("code");
    const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);
    const returnTo = sessionStorage.getItem(AUTH_RETURN_TO_STORAGE_KEY);
    // Uso único: o verifier nunca deve ser reaproveitado numa segunda tentativa.
    sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY);

    if (!code || !codeVerifier) {
      setStatus("error");
      setMessage("Sessão de login inválida ou expirada. Tente novamente.");
      return;
    }

    const run = async () => {
      const tokens = await exchangeCodeForTokens({
        domain: process.env.NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN as string,
        clientId: process.env.NEXT_PUBLIC_COGNITO_CRM_CLIENT_ID as string,
        redirectUri: `${window.location.origin}/auth/callback`,
        code,
        codeVerifier,
      });

      const decoded: any = jwtDecode(tokens.id_token);
      const groups = decoded["cognito:groups"] || [];
      const isGlobalAdmin = groups.includes("GlobalAdmin");
      // gestao-de-acesso-f5 RF-07: o grupo TenantAdmin não vira papel; só o operador é marcado.
      const role = isGlobalAdmin ? "GlobalAdmin" : "USER";

      const sessionData = {
        email: decoded.email,
        name: decoded.name || decoded.email,
        tenantId: decoded["custom:tenant_id"],
        role,
        token: tokens.id_token,
      };

      setSession(sessionData);

      const allMyTenants = await TenantService.listMyTenants();
      if (!allMyTenants || allMyTenants.length === 0) {
        router.push("/onboarding");
        return;
      }

      const myTenants = await TenantService.listMyTenants("crm");
      if ((!myTenants || myTenants.length === 0) && !isGlobalAdmin) {
        setSession(null);
        setStatus("error");
        setMessage("Este produto não faz parte do seu plano atual.");
        return;
      }

      const primaryTenant = myTenants.length > 0 ? myTenants[0] : allMyTenants[0];
      setSession({
        ...sessionData,
        tenantId: primaryTenant.id,
        tenantName: primaryTenant.nome_negocio,
      });

      const defaultDestination = isGlobalAdmin ? "/tenants" : "/kanban";
      const safeReturnTo =
        returnTo && !["/", "/auth/callback"].includes(returnTo) ? returnTo : defaultDestination;
      router.push(safeReturnTo);
    };

    run().catch((err) => {
      console.error("Erro no callback de autenticação:", err);
      setSession(null);
      setStatus("error");
      setMessage("Não foi possível concluir o login. Tente novamente.");
    });
  }, [searchParams, router, setSession]);

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-4">
            <XCircle className="text-red-500" size={48} />
            <h1 className="text-xl font-bold text-gray-800">{message}</h1>
            <button
              onClick={() => redirectToHostedUI("/kanban")}
              className="mt-4 bg-brand-orange text-white px-6 py-2 rounded-md font-bold hover:brightness-110"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="flex flex-col items-center gap-4">
        <RefreshCw className="animate-spin text-primary-600" size={48} />
        <h1 className="text-xl font-bold text-gray-800">{message}</h1>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">Carregando...</div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
