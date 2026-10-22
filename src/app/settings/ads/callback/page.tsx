"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TenantService } from "@/services/api";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";

function AdsCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processando autorização...");
  const hasExecuted = useRef(false);

  useEffect(() => {
    if (hasExecuted.current) return;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setStatus("error");
      setMessage("Parâmetros de autorização ausentes.");
      return;
    }

    const handleCallback = async () => {
      hasExecuted.current = true;
      try {
        const redirectUri = `${window.location.origin}/settings/ads/callback`;
        await TenantService.googleAdsCallback(code, state, redirectUri);
        setStatus("success");
        setMessage("Google Ads conectado com sucesso!");
        setTimeout(() => {
          router.push("/kanban");
        }, 3000);
      } catch (err: any) {
        console.error("Erro no callback do Google Ads:", err);
        const backendError = err.response?.data?.message || err.response?.data?.error || "Erro interno no servidor.";
        setStatus("error");
        setMessage(`Falha ao vincular conta: ${backendError}`);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="animate-spin text-primary-600" size={48} />
            <h1 className="text-xl font-bold text-gray-800">{message}</h1>
          </div>
        )}
        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="text-green-500" size={48} />
            <h1 className="text-xl font-bold text-gray-800">{message}</h1>
            <p className="text-gray-500 text-sm">Você será redirecionado em instantes...</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="text-red-500" size={48} />
            <h1 className="text-xl font-bold text-gray-800">{message}</h1>
            <button 
              onClick={() => router.push("/kanban")}
              className="mt-4 bg-primary-600 text-white px-6 py-2 rounded-md font-bold hover:bg-primary-700"
            >
              Voltar ao CRM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdsCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50">Carregando...</div>}>
      <AdsCallbackContent />
    </Suspense>
  );
}
