"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, XCircle } from "lucide-react";
import { GoogleAgendaService } from "@/services/api";
import {
  CAMINHO_RETORNO_GOOGLE_AGENDA,
  CHAVE_CONEXAO_GOOGLE_AGENDA,
  URL_ABA_GOOGLE_AGENDA,
  prepararConexaoGoogleAgenda,
} from "@/lib/google-agenda";

// Retorno do consentimento do Google Agenda (spec crm-google-agenda RF-21).

const MENSAGEM_GENERICA = "Não foi possível conectar o Google Agenda. Tente de novo.";

type Estado =
  | { tipo: "conectando" }
  | { tipo: "falha" }
  | { tipo: "escopo_negado"; tentarDeNovo: string };

function lerGuardado(): { state: string; tenant_id: string } | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_CONEXAO_GOOGLE_AGENDA);
    const valor = bruto ? JSON.parse(bruto) : null;
    if (typeof valor?.state === "string" && typeof valor?.tenant_id === "string") return valor;
  } catch {
    // JSON estragado conta como nada guardado: a tela mostra a falha.
  }
  return null;
}

function RetornoGoogleAgenda() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "conectando" });
  const executou = useRef(false);

  useEffect(() => {
    if (executou.current) return;
    executou.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const guardado = lerGuardado();
    if (!code || searchParams.get("error") || !guardado || state !== guardado.state) {
      setEstado({ tipo: "falha" });
      return;
    }

    // A chave sai antes da chamada: o mesmo state nunca vale duas vezes.
    sessionStorage.removeItem(CHAVE_CONEXAO_GOOGLE_AGENDA);
    GoogleAgendaService.conectar(guardado.tenant_id, code, `${window.location.origin}${CAMINHO_RETORNO_GOOGLE_AGENDA}`)
      .then(() => router.push(URL_ABA_GOOGLE_AGENDA))
      .catch((err) => {
        console.error("Falha ao conectar o Google Agenda", err);
        if (err?.response?.data?.error === "escopo_obrigatorio_negado") {
          setEstado({ tipo: "escopo_negado", tentarDeNovo: prepararConexaoGoogleAgenda(guardado.tenant_id) });
        } else {
          setEstado({ tipo: "falha" });
        }
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
        {estado.tipo === "conectando" ? (
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="animate-spin text-primary-600" size={48} aria-hidden="true" />
            <h1 className="text-xl font-bold text-gray-800">Conectando o Google Agenda…</h1>
          </div>
        ) : (
          <div role="alert" className="flex flex-col items-center gap-4">
            <XCircle className="text-red-500" size={48} aria-hidden="true" />
            <h1 className="text-xl font-bold text-gray-800">
              {estado.tipo === "escopo_negado" ? "Para conectar, permita que o CRM crie eventos na sua agenda." : MENSAGEM_GENERICA}
            </h1>
            {estado.tipo === "escopo_negado" ? (
              <a href={estado.tentarDeNovo} className="mt-4 bg-primary-600 text-white px-6 py-2 rounded-md font-bold hover:bg-primary-700">
                Tentar de novo
              </a>
            ) : (
              <Link href={URL_ABA_GOOGLE_AGENDA} className="mt-4 bg-primary-600 text-white px-6 py-2 rounded-md font-bold hover:bg-primary-700">
                Voltar às configurações
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoogleAgendaCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50">Carregando...</div>}>
      <RetornoGoogleAgenda />
    </Suspense>
  );
}
