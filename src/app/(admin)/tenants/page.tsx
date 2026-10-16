"use client";

import { useEffect, useState } from "react";
import { TenantService } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { Plus, X, Building, Mail, Briefcase, Hash, LayoutGrid, Search, UserPlus, User, Eye, EyeOff, Copy, Check, Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { userInviteSchema } from "@/lib/validations";
import { Input } from "@/components/ui/Input";
import { z } from "zod";

type UserInviteFormValues = z.infer<typeof userInviteSchema>;

// Sub-componente para gerenciar notificações push por tenant
function BellToggle({ tenantId }: { tenantId: string }) {
  const { isSubscribed, subscribeUser, unsubscribeUser, loading } = usePushNotifications(tenantId);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        isSubscribed ? unsubscribeUser() : subscribeUser();
      }}
      disabled={loading}
      className={`p-2 rounded-md transition-all duration-200 ${
        isSubscribed 
          ? "bg-primary-100 text-primary-600 hover:bg-primary-200 shadow-inner" 
          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
      } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
      title={isSubscribed ? "Desativar notificações para este cliente" : "Ativar notificações para este cliente"}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      ) : isSubscribed ? (
        <Bell size={16} fill="currentColor" />
      ) : (
        <BellOff size={16} />
      )}
    </button>
  );
}

// Sub-componente para exibição segura da API Key
function ApiKeyCell({ apiKey }: { apiKey: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <code className="text-[10px] font-mono bg-gray-100 px-2 py-1 rounded border min-w-[120px] text-gray-600">
        {visible ? apiKey : "up_••••••••••••••••••••"}
      </code>
      <button 
        onClick={() => setVisible(!visible)} 
        className="text-gray-400 hover:text-primary-600 transition-colors"
        title={visible ? "Ocultar Chave" : "Revelar Chave"}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button 
        onClick={handleCopy} 
        className="text-gray-400 hover:text-green-600 transition-colors"
        title="Copiar para área de transferência"
      >
        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Modais
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedTenantForUser, setSelectedTenantForUser] = useState<string>("");
  
  const { session, logout } = useAuthStore();
  const router = useRouter();

  const [isMobile, setIsMobile] = useState(false);

  const userInviteForm = useForm<UserInviteFormValues>({
    resolver: zodResolver(userInviteSchema),
  });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Aguarda a hidratação e a presença da sessão para decidir o redirecionamento
    if (!session) return; 

    if (session.role !== "GlobalAdmin") {
      router.push("/kanban");
      return;
    }
    loadTenants();
  }, [session, router]);

  const loadTenants = async () => {
    try {
      const data = await TenantService.list();
      setTenants(data);
    } catch (err) {
      console.error("Erro ao carregar tenants", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (data: UserInviteFormValues) => {
    try {
      const payload = { 
        ...data, 
        email: data.email.toLowerCase().trim() 
      };
      await TenantService.createUser(payload);
      setIsUserModalOpen(false);
      userInviteForm.reset();
      alert("Usuário convidado com sucesso! Ele receberá um e-mail para definir a senha.");
    } catch (err) {
      alert("Falha ao criar usuário");
    }
  };

  const filteredTenants = tenants.filter(t => 
    t.nome_negocio.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email_contato.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-gray-500 font-medium">Carregando painel administrativo...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-900">
      <Navbar />

      <main className="p-4 md:p-8 max-w-[1600px] mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3 uppercase tracking-tight">
              <Building className="text-primary-600" size={28} /> Gestão de Inquilinos
            </h1>
            <p className="text-gray-500 text-sm font-medium">Controle central de instâncias e acessos do sistema.</p>
          </div>
        </div>

        {/* Filtro de Busca */}
        <div className="mb-6 flex items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <Search className="text-gray-400 mr-3" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por nome do negócio ou e-mail do administrador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full outline-none text-sm text-gray-700 bg-transparent"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="text-gray-400 hover:text-gray-600 ml-2">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto hidden md:block border border-gray-200 custom-scrollbar">
          <table className="min-w-full divide-y divide-gray-200 table-auto">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Negócio</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Contato / Ads ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">API Integration</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Nicho</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTenants.length > 0 ? (
                filteredTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="font-bold text-gray-900">{t.nome_negocio}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{t.id}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{t.email_contato}</div>
                      <div className="text-xs font-bold text-primary-600">{t.google_ads_customer_id || "Não configurado"}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <ApiKeyCell apiKey={t.api_key} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">{t.nicho}</span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.status === 'ATIVO' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center gap-2 justify-end">
                        <BellToggle tenantId={t.id} />
                        <button 
                          onClick={() => { 
                            setSelectedTenantForUser(t.id);
                            userInviteForm.setValue("tenant_id", t.id);
                            setIsUserModalOpen(true); 
                          }}
                          className="bg-gray-100 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-200 transition-colors font-bold flex items-center gap-1"
                          title="Adicionar Usuário"
                        >
                          <UserPlus size={14} />
                        </button>
                        <button 
                          onClick={() => router.push(`/kanban?tenant_id=${encodeURIComponent(t.id)}`)}
                          className="bg-primary-50 text-primary-700 px-3 py-1 rounded-md hover:bg-primary-100 transition-colors font-bold flex items-center gap-1"
                        >
                          <LayoutGrid size={14} /> Acessar CRM
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm font-medium">
                    Nenhum inquilino encontrado para sua busca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {filteredTenants.length > 0 ? (
            filteredTenants.map((t) => (
              <div key={t.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-900">{t.nome_negocio}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{t.id}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.status === 'ATIVO' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {t.status}
                    </span>
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">{t.nicho}</span>
                  </div>
                </div>
                
                <div className="p-4 space-y-3 flex-1">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Contato e Ads</div>
                    <div className="text-sm text-gray-600">{t.email_contato}</div>
                    <div className="text-xs font-bold text-primary-600">{t.google_ads_customer_id || "Não configurado"}</div>
                  </div>
                  
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Integração API</div>
                    <ApiKeyCell apiKey={t.api_key} />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 flex gap-2">
                  <BellToggle tenantId={t.id} />
                  <button 
                    onClick={() => { 
                      setSelectedTenantForUser(t.id);
                      userInviteForm.setValue("tenant_id", t.id);
                      setIsUserModalOpen(true); 
                    }}
                    className="flex-1 bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <UserPlus size={14} /> Usuário
                  </button>
                  <button 
                    onClick={() => router.push(`/kanban?tenant_id=${encodeURIComponent(t.id)}`)}
                    className="flex-[2] bg-primary-600 text-white px-3 py-2 rounded-md hover:bg-primary-700 transition-colors font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    <LayoutGrid size={14} /> Acessar CRM
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-10 text-center text-gray-400 text-sm font-medium rounded-lg shadow border border-gray-200">
              Nenhum inquilino encontrado para sua busca.
            </div>
          )}
        </div>
      </main>

      {/* Modal Novo Usuário para Tenant Existente */}
      <AnimatePresence>
        {isUserModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsUserModalOpen(false)}
            className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50"
          >
            <motion.div 
              initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
              transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (isMobile && info.offset.y > 150) {
                  setIsUserModalOpen(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-md shadow-xl text-gray-900 max-h-[95vh] flex flex-col overflow-hidden"
            >
              <div className="shrink-0 px-6 pt-6">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-primary-700"><UserPlus size={20} /> Convidar Usuário</h2>
                  <button onClick={() => setIsUserModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-6">O usuário será vinculado ao tenant <strong>{tenants.find(t => t.id === selectedTenantForUser)?.nome_negocio}</strong>.</p>
              </div>

              <div className="overflow-y-auto flex-1 px-6 pb-6 custom-scrollbar">
                <form onSubmit={userInviteForm.handleSubmit(handleCreateUser)} className="space-y-4">
                  <Input 
                    label="Nome Completo"
                    icon={<User size={14}/>}
                    {...userInviteForm.register("name")}
                    error={userInviteForm.formState.errors.name?.message}
                  />
                  <Input 
                    label="E-mail"
                    icon={<Mail size={14}/>}
                    type="email"
                    {...userInviteForm.register("email")}
                    error={userInviteForm.formState.errors.email?.message}
                  />
                  <input type="hidden" {...userInviteForm.register("tenant_id")} />
                  
                  <button type="submit" className="w-full bg-primary-600 text-white p-3 rounded-md font-bold hover:bg-primary-700 transition-colors shadow-lg">
                    Convidar e Criar Usuário
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
