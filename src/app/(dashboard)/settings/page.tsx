"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { Shield, User, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import TabMyAccount from "./_components/TabMyAccount";
import TabTeam from "./_components/TabTeam";
import { useAcessosDoCRM } from "@/contexts/AcessosContext";

export default function SettingsPage() {
  const { session } = useAuthStore();
  const [activeTab, setActiveTab] = useState("my-account");
  const { podeNoPortal, erro: erroAcessos } = useAcessosDoCRM();
  // gestao-de-acesso-f5 RF-07: a aba Equipe (link para o Portal) aparece para quem gere usuários no Portal, nunca por grupo ou role antigo.
  const podeVerEquipe = session?.role === "GlobalAdmin" || podeNoPortal("portal.usuarios.gerir");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-900">
      <Navbar />

      <main className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <header className="mb-8">
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
            <Shield className="text-brand-blue" size={28} /> Configurações
          </h1>
          <p className="text-gray-500 text-sm font-medium">Gerencie suas informações, equipe e sistema.</p>
        </header>

        {erroAcessos && session?.role !== "GlobalAdmin" && (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Não foi possível carregar suas permissões nesta empresa. A aba Equipe pode não aparecer. Recarregue a página para tentar de novo.
          </p>
        )}
        {/* Tab Navigation */}
        <div 
          role="tablist" 
          aria-label="Configurações"
          className="flex space-x-2 border-b border-gray-200 mb-6 overflow-x-auto"
        >
          <button
            role="tab"
            aria-selected={activeTab === "my-account"}
            onClick={() => setActiveTab("my-account")}
            className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "my-account" 
                ? "border-brand-blue text-brand-blue" 
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <User size={18} /> Minha Conta
          </button>

          {podeVerEquipe && (
            <button
              role="tab"
              aria-selected={activeTab === "team"}
              onClick={() => setActiveTab("team")}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === "team" 
                  ? "border-brand-blue text-brand-blue" 
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Users size={18} /> Equipe
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div role="tabpanel">
          {activeTab === "my-account" && <TabMyAccount />}
          {activeTab === "team" && podeVerEquipe && <TabTeam />}
        </div>
      </main>
    </div>
  );
}
