"use client";

import { useState, useEffect, useCallback } from "react";

import { Users, UserPlus, X, Shield, Mail, User, Trash2, Crown } from "lucide-react";
import { TenantService } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/authStore";
import { useTenant } from "@/contexts/TenantContext";

export default function TabTeam() {
  const { session } = useAuthStore();
  const isCurrentUserGlobalAdmin = session?.role === 'GlobalAdmin';
  const { activeTenantId } = useTenant();
  
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "user" });
  const [inviting, setInviting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      setLoading(true);
      const res = await TenantService.listUsers(activeTenantId);
      setUsers(res || []);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      alert("Falha ao carregar a lista de usuários.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);


  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setInviting(true);
      await TenantService.addUser(inviteForm, activeTenantId);
      setShowInviteModal(false);
      setInviteForm({ name: "", email: "", role: "user" });
      await fetchUsers();
    } catch (error) {
      console.error("Erro ao convidar:", error);
      alert("Ocorreu um erro ao convidar o usuário.");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!confirm("Tem certeza que deseja remover este usuário permanentemente?")) return;
    try {
      setActionLoading(`remove-${email}`);
      await TenantService.removeUser(email, activeTenantId);
      await fetchUsers();
    } catch (error) {
      console.error(error);
      alert("Erro ao remover usuário.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (email: string, currentRole: string) => {
    const isCurrentlyAdmin = currentRole?.toLowerCase() === 'tenantadmin' || currentRole?.toLowerCase() === 'admin';
    const newRole = isCurrentlyAdmin ? 'user' : 'TenantAdmin';
    try {
      setActionLoading(`role-${email}`);
      await TenantService.updateUserRole(email, newRole, activeTenantId);
      await fetchUsers();
    } catch (error) {
      console.error(error);
      alert("Erro ao atualizar nível.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Users className="text-brand-blue" size={24} /> 
            Gestão de Equipe
          </h2>
          <p className="text-sm text-gray-500 font-medium mt-1">Gerencie os acessos e permissões dos membros do seu negócio.</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="group relative px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all flex items-center gap-2 text-sm shadow-xl shadow-gray-900/20 overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
          <UserPlus size={18} className="relative z-10" /> 
          <span className="relative z-10">Convidar Membro</span>
        </button>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-50/80 p-4 border-b border-gray-100 flex justify-between items-center">
          <span className="text-xs font-black uppercase tracking-widest text-gray-400">Membros Ativos ({users.length})</span>
        </div>
        
        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-4">
              <div className="w-8 h-8 border-4 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
              <p className="text-sm font-bold animate-pulse">Carregando diretório de usuários...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Users size={48} className="text-gray-200 mb-4" />
              <p className="text-sm font-bold text-gray-500">Nenhum membro encontrado.</p>
              <p className="text-xs text-gray-400 mt-1">Sua equipe parece vazia. Que tal convidar alguém?</p>
            </div>
          ) : (
            <AnimatePresence>
              {users.map((u, idx) => {
                const adminCount = users.filter((user) => user.role?.toLowerCase() === 'tenantadmin' || user.role?.toLowerCase() === 'admin' || user.role === 'GlobalAdmin').length;
                const isTenantAdmin = u.role?.toLowerCase() === 'tenantadmin' || u.role?.toLowerCase() === 'admin';
                const isLastAdmin = isTenantAdmin && adminCount <= 1;
                const isTargetGlobalAdmin = u.role === 'GlobalAdmin' || (u.email === session?.email && isCurrentUserGlobalAdmin);
                const disableActions = isLastAdmin || isTargetGlobalAdmin;
                const actionTitle = disableActions 
                  ? (isTargetGlobalAdmin ? "Ação restrita ao painel AWS" : "Único administrador não pode ser rebaixado/removido") 
                  : "";
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.05 }}
                    key={u.id || u.email} 
                    className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-gray-50/80 transition-colors group"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center shadow-inner relative overflow-hidden">
                        {isTenantAdmin ? (
                          <Crown size={20} className="text-brand-blue" />
                        ) : (
                          <User size={20} className="text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black text-gray-900 text-base">{u.name}</p>
                          {isTargetGlobalAdmin && (
                            <span className="px-2 py-0.5 rounded-md border bg-blue-100 border-blue-200 text-blue-800 text-xs font-bold">
                              Global Admin
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 font-medium">{u.email}</p>
                      </div>
                    </div>

                    {/* Role & Actions */}
                    <div className="flex items-center w-full md:w-auto justify-between md:justify-end gap-6">
                      <div className={`px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                        isTargetGlobalAdmin
                          ? 'bg-blue-100 border-blue-200 text-blue-800'
                          : isTenantAdmin 
                          ? 'bg-brand-blue/5 border-brand-blue/20 text-brand-blue' 
                          : 'bg-gray-100 border-gray-200 text-gray-500'
                      }`}>
                        {isTargetGlobalAdmin ? <Crown size={12} /> : isTenantAdmin ? <Crown size={12} /> : <Shield size={12} />}
                        {isTargetGlobalAdmin ? 'Global Admin' : isTenantAdmin ? 'Tenant Admin' : 'Usuário'}
                      </div>

                      <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleToggleRole(u.email, u.role)} 
                          disabled={actionLoading !== null || disableActions}
                          title={actionTitle || "Alterar Acesso"}
                          aria-label="Alterar Acesso"
                          className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                            disableActions ? "text-gray-300" : "text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5"
                          }`}
                        >
                          {actionLoading === `role-${u.email}` ? (
                            <span className="animate-pulse">Aguarde...</span>
                          ) : (
                            <>Alterar Acesso</>
                          )}
                        </button>
                        <button 
                          onClick={() => handleRemove(u.email)} 
                          disabled={actionLoading !== null || disableActions}
                          title={actionTitle || "Remover Membro"}
                          aria-label="Remover Membro"
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            disableActions ? "text-gray-300" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                          }`}
                        >
                          {actionLoading === `remove-${u.email}` ? (
                            <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                      {isTargetGlobalAdmin && !isCurrentUserGlobalAdmin && (
                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">
                          Ação restrita a Global Admins
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Modal de Convite (Glassmorphism) */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div
              role="dialog"
              aria-label="Adicionar Membro"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
            >
              <div className="p-6 pb-0">
                <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center mb-4">
                  <UserPlus size={24} className="text-brand-blue" />
                </div>
                <h3 className="font-black text-2xl text-gray-900 tracking-tight">Adicionar Membro</h3>
                <p className="text-sm text-gray-500 font-medium mt-1">Insira os dados para enviar o convite.</p>
              </div>

              <form onSubmit={handleInvite} className="p-6 space-y-5">
                <div>
                  <label htmlFor="invite-name" className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
                  <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 transition-all">
                    <User size={18} className="text-gray-400" />
                    <input
                      id="invite-name"
                      required
                      type="text"
                      placeholder="Ex: Ana Silva"
                      className="bg-transparent outline-none w-full text-sm font-bold text-gray-900 placeholder-gray-400"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="invite-email" className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Endereço de E-mail</label>
                  <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 transition-all">
                    <Mail size={18} className="text-gray-400" />
                    <input
                      id="invite-email"
                      required
                      type="email"
                      placeholder="ana@empresa.com"
                      className="bg-transparent outline-none w-full text-sm font-bold text-gray-900 placeholder-gray-400"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="invite-role" className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Nível de Acesso</label>
                  <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 transition-all">
                    <Shield size={18} className="text-gray-400" />
                    <select
                      id="invite-role"
                      className="bg-transparent outline-none w-full text-sm font-bold text-gray-900 cursor-pointer"
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    >
                      <option value="user">Usuário Padrão</option>
                      <option value="TenantAdmin">Administrador (TenantAdmin)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-6 flex gap-3 border-t border-gray-100 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 px-4 py-3.5 bg-white border-2 border-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex-[2] px-4 py-3.5 bg-brand-blue text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-brand-blue/30 flex justify-center items-center gap-2"
                  >
                    {inviting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Convidando...
                      </>
                    ) : (
                      "Enviar Convite"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
