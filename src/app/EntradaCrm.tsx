"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";
import { useAuthStore } from "@/store/authStore";
import { redirectToHostedUI } from "@/lib/pkce";

// crm-raiz-vai-ao-login: a raiz não tem página de apresentação (a venda do CRM
// é em unumpeople.app/crm). Com sessão válida vai ao destino padrão, o mesmo
// do /auth/callback; sem sessão, ou com ela expirada, vai ao login do Cognito.
// O AuthGuard só renderiza esta tela depois de reidratar a sessão.
function sessaoValida(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export default function EntradaCrm() {
  const router = useRouter();
  const [falhou, setFalhou] = useState(false);

  // CA-10: falha ao montar o login (configuração ausente, navegador sem
  // crypto.subtle) não pode deixar a primeira tela girando sem aviso.
  const abrirLogin = useCallback(() => {
    setFalhou(false);
    redirectToHostedUI("/", { ignorarTravaDeLogout: true }).catch((err) => {
      console.error("Não foi possível abrir o login do Cognito:", err);
      setFalhou(true);
    });
  }, []);

  // A decisão roda uma vez por abertura: refazê-la a cada render esconderia o
  // aviso de falha e tentaria o login em laço.
  const decidiu = useRef(false);

  useEffect(() => {
    if (decidiu.current) return;
    decidiu.current = true;
    const { isAuthenticated, session, logout } = useAuthStore.getState();

    if (isAuthenticated && session && sessaoValida(session.token)) {
      router.replace(session.role === "GlobalAdmin" ? "/tenants" : "/kanban");
      return;
    }

    if (session) logout();
    abrirLogin();
  }, [router, abrirLogin]);

  if (falhou) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
        <div role="alert" className="flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-bold text-gray-800">Não foi possível abrir o login.</p>
          <p className="text-gray-600">Confira a conexão e tente de novo.</p>
          <button
            type="button"
            onClick={abrirLogin}
            className="bg-brand-orange text-white px-6 py-2 rounded-md font-bold hover:brightness-110"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div
        role="status"
        aria-label="Abrindo o CRM"
        className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
      ></div>
    </div>
  );
}
