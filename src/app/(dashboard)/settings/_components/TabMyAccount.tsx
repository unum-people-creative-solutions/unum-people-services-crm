"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { User, Mail, Shield, Building, Save, ExternalLink, Bell, AlertTriangle } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useTenant } from "@/contexts/TenantContext";

export default function TabMyAccount() {
  const { session } = useAuthStore();
  const { isSubscribed, subscribeUser, unsubscribeUser, loading: pushLoading, permission } = usePushNotifications();
  const { activeTenantName } = useTenant();
  const [isExporting, setIsExporting] = useState(false);

  // Consider mobile if window is narrow, but for modal let's just use CSS media queries
  // or a simple heuristic if needed. For simplicity, omit complex JS mobile detection 
  // since CSS handles most of it.
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const handleExportData = () => {
    setIsExporting(true);
    try {
      const dataToExport = {
        timestamp: new Date().toISOString(),
        user: {
          name: session?.name,
          email: session?.email,
          role: session?.role,
        },
        tenant: {
          id: session?.tenantId,
          name: activeTenantName || "Unum People Central",
        },
        notice: "Este arquivo contém seus dados pessoais e de vínculo corporativo armazenados em nossa plataforma."
      };

      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meus-dados.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar dados:", error);
      alert("Ocorreu um erro ao exportar seus dados. Tente novamente mais tarde.");
    } finally {
      setTimeout(() => setIsExporting(false), 1000);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {/* Perfil */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
            <User size={16} /> Informações Pessoais
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <User size={18} className="text-gray-400" />
                <span className="font-bold text-gray-700">{session?.name || "N/A"}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">E-mail de Acesso</label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-gray-400">
                <Mail size={18} />
                <span className="font-medium">{session?.email || "N/A"}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nível de Acesso (Cargo)</label>
              <div className="flex items-center gap-3 p-3 bg-brand-blue/5 rounded-lg border border-brand-blue/20 text-brand-blue">
                <Shield size={18} />
                <span className="font-black uppercase tracking-tighter">{session?.role || "Usuário"}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Notificações */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
            <Bell size={16} /> Notificações Push
          </h2>
          
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex-1 mr-4">
              <p className="font-bold text-gray-700">Notificações no Navegador</p>
              {permission === 'denied' && (
                <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">
                  ⚠️ Notificações bloqueadas no seu navegador. Ative-as nas configurações do site.
                </p>
              )}
            </div>
            
            <button
              onClick={() => isSubscribed ? unsubscribeUser() : subscribeUser()}
              disabled={pushLoading || permission === 'denied'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                isSubscribed ? 'bg-primary-600' : 'bg-gray-200'
              } ${pushLoading || permission === 'denied' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isSubscribed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Tenant Info */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
            <Building size={16} /> Vínculo Profissional
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary-50 rounded-xl border border-primary-100">
              <div>
                <p className="text-[10px] font-black text-primary-400 uppercase">Nome do Negócio / Empresa</p>
                <p className="font-black text-primary-900 text-lg leading-tight">
                  {activeTenantName || "Não Identificado"}
                </p>
              </div>
              <Building size={32} className="text-support-grey/50" />
            </div>
          </div>
        </section>

        {/* LGPD e Documentos */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
            <Shield size={16} /> LGPD & Transparência
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={handleExportData}
              disabled={isExporting}
              className="md:col-span-2 group flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="font-bold text-gray-700">Exportar Meus Dados</p>
                </div>
              </div>
              {isExporting ? (
                <div className="flex items-center gap-2 text-brand-blue font-bold text-xs">
                  Processando...
                </div>
              ) : (
                <Save size={16} className="text-gray-300" />
              )}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
