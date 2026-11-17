"use client";

import { useEffect, useState, useId } from "react";
import { useRouter } from "next/navigation";
import { TenantService } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { onboardingSchema } from "@/lib/validations";
import { Input } from "@/components/ui/Input";
import { redirectToHostedUI } from "@/lib/pkce";
import { z } from "zod";
import { AREAS_DE_ATUACAO } from "@/lib/areasDeAtuacao";

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nichoId = useId();
  
  const { session, setSession } = useAuthStore();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
  });

  useEffect(() => {
    const checkTenants = async () => {
      try {
        const myTenants = await TenantService.listMyTenants();
        if (myTenants && myTenants.length > 0) {
          router.push("/kanban");
        }
      } catch (err) {
        console.error("Erro ao verificar tenants:", err);
      }
    };
    
    if (session) {
      checkTenants();
    } else {
      void redirectToHostedUI("/");
    }
  }, [session]);

  const onSubmit = async (data: OnboardingFormValues) => {
    setLoading(true);
    setError("");

    try {
      if (!session) return;

      const tenant = await TenantService.create({
        nome_negocio: data.nome_negocio,
        nome_admin: session.name,
        email_contato: session.email,
        nicho: data.nicho,
        google_ads_customer_id: data.google_ads_customer_id || undefined,
      });

      setSession({
        ...session,
        tenantId: tenant.id,
        tenantName: tenant.nome_negocio,
      });

      router.push("/kanban");
    } catch (err: any) {
      setError(err.response?.data?.error || "Erro ao criar sua conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg border-t-4 border-primary-600">
        <div className="flex justify-center mb-6">
          <Image src="/images/logo_texto.webp" alt="Unum People" width={200} height={60} className="object-contain" priority />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Configuração da sua Conta</h1>
        <p className="text-gray-500 text-center mb-8">
          Parece que você ainda não configurou seu negócio. Preencha os dados abaixo para começar.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-md border border-red-100">{error}</div>}
          
          <Input 
            label="Nome do seu Negócio"
            {...register("nome_negocio")}
            error={errors.nome_negocio?.message}
            placeholder="Ex: Minha Empresa de Tráfego"
          />

          <div>
            <label htmlFor={nichoId} className="block text-sm font-semibold text-gray-700 mb-2">Área de atuação</label>
            <select
              id={nichoId}
              {...register("nicho")}
              className={`w-full p-3 border rounded-md focus:ring-2 focus:ring-primary-500 outline-none transition-all bg-white ${
                errors.nicho ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">Selecione</option>
              {AREAS_DE_ATUACAO.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            {errors.nicho && <p className="text-red-500 text-xs mt-1">{errors.nicho.message}</p>}
          </div>

          <Input 
            label="Google Ads Customer ID (Opcional)"
            {...register("google_ads_customer_id")}
            error={errors.google_ads_customer_id?.message}
            placeholder="000-000-0000"
          />
          <p className="mt-[-1rem] text-xs text-gray-400">Você poderá configurar isso depois nas configurações.</p>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white p-4 rounded-md font-bold hover:bg-primary-700 transition-all shadow-lg hover:shadow-primary-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Configurando...
              </span>
            ) : (
              "Finalizar e Acessar Kanban"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
