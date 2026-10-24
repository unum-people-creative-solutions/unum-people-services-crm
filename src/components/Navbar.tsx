"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import Image from "next/image";
import Link from "next/link";
import {
  Menu, X, LogOut, Settings, LayoutGrid, Building,
  ExternalLink, ChevronDown, Plus, TrendingUp, HelpCircle,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTenant } from "@/contexts/TenantContext";
import { logoutFromHostedUI } from "@/lib/pkce";
import pkg from "../../package.json";

interface NavbarProps {
  onRefresh?: () => void;
  onNewLead?: () => void;
  newLeadLabel?: string;
  onNewSale?: () => void;
  newSaleLabel?: string;
  children?: React.ReactNode; 
}

export default function Navbar({ 
  onRefresh, 
  onNewLead, 
  newLeadLabel = "Novo Lead Manual",
  onNewSale,
  newSaleLabel = "Registrar Nova Venda",
  children 
}: NavbarProps) {
  const { session, logout } = useAuthStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const {
    activeTenantId,
    activeTenantName,
    availableTenants,
    isMultiTenant,
    switchTenant,
  } = useTenant();

  // Bloquear scroll quando menu mobile estiver aberto
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  const handleLogout = () => {
    logout();
    logoutFromHostedUI();
  };

  return (
    <nav className="bg-white border-b shadow-sm z-50 sticky top-0">
      <div className="max-w-[1600px] mx-auto px-4">
        <div className="flex justify-between h-16 items-center gap-4">
          
          {/* Lado Esquerdo: Logo e Filtros */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Link href="/kanban" className="flex-shrink-0">
              <Image 
                src="/images/logo_simbolo.webp" 
                alt="Unum People" 
                width={36} 
                height={32} 
                className="object-contain"
              />
            </Link>
            
            {/* Switcher de Tenant no Desktop */}
            {isMultiTenant && (
              <div className="hidden md:relative md:block">
                <button
                  onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
                  className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-800 px-3.5 py-2 rounded-xl text-xs font-black transition-all border border-gray-200/60 shadow-sm uppercase tracking-wider"
                  aria-label={activeTenantName}
                  role="button"
                >
                  <Building size={14} className="text-gray-500" />
                  <span>{activeTenantName}</span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${isTenantDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {isTenantDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-30" 
                        onClick={() => setIsTenantDropdownOpen(false)}
                      />
                      <motion.div
                        role="listbox"
                        className="absolute left-0 mt-2 w-64 bg-white border border-gray-100 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] z-40 py-2 overflow-hidden"
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        transition={{ duration: 0.1 }}
                      >
                        {availableTenants.map((t) => (
                          <button
                            key={t.id}
                            role="option"
                            aria-selected={t.id === activeTenantId}
                            disabled={t.is_blocked}
                            onClick={() => {
                              switchTenant(t.id);
                              setIsTenantDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-4 py-3 text-xs text-left transition-colors font-bold uppercase tracking-wider ${
                              t.is_blocked
                                ? "opacity-40 cursor-not-allowed text-gray-400 bg-gray-50"
                                : t.id === activeTenantId
                                  ? "bg-primary-50 text-primary-700"
                                  : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span>{t.nome_negocio}</span>
                            {t.is_blocked && (
                              <span className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                Bloqueado
                              </span>
                            )}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
            
            {/* Espaço para Filtros/Seletores */}
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
              {children}
            </div>
          </div>

          {/* Lado Direito: Ações e Menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            
            {/* Botão de Refresh Rápido */}
            {onRefresh && (
              <button 
                onClick={onRefresh}
                className="hidden md:flex p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition-all"
                title="Atualizar"
              >
                <RefreshCw size={20} />
              </button>
            )}

            {/* Menu Expansível Principal */}
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-2 bg-primary-600 text-white px-3 py-2 sm:px-4 rounded-lg text-sm font-black hover:bg-primary-700 transition-all shadow-md group"
              >
                {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
                <span className="hidden sm:inline text-[11px] uppercase tracking-wider">Menu Principal</span>
                <ChevronDown size={14} className={`hidden md:block transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu logic */}
              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    {/* Backdrop para Desktop */}
                    <div 
                      className="hidden md:block fixed inset-0 z-10" 
                      onClick={() => setIsMenuOpen(false)}
                    ></div>

                    {/* Mobile Full-Screen Menu */}
                    <motion.div
                      className="md:hidden fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex flex-col overflow-y-auto"
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "100%" }}
                      transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    >
                      <div className="p-6">
                        <div className="flex justify-between items-center mb-8">
                          <Image 
                            src="/images/logo_simbolo.webp" 
                            alt="Unum People" 
                            width={40} 
                            height={36} 
                            className="object-contain"
                          />
                          <button 
                            onClick={() => setIsMenuOpen(false)}
                            className="p-3 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            <X size={28} />
                          </button>
                        </div>

                        <div className="space-y-8">
                          {/* Seção: Ações de Vendas/Leads */}
                          {(onNewLead || onNewSale) && (
                            <div className="space-y-4">
                              <div className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Plus size={14} /> Operação
                              </div>
                              <div className="grid gap-3">
                                {onNewLead && (
                                  <button onClick={() => { onNewLead(); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-6 py-5 text-base font-bold text-primary-700 bg-primary-50 rounded-2xl transition-all active:scale-[0.98]">
                                    <Plus className="text-primary-600" size={24} /> {newLeadLabel}
                                  </button>
                                )}
                                {onNewSale && (
                                  <button onClick={() => { onNewSale(); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-6 py-5 text-base font-bold text-green-700 bg-green-50 rounded-2xl transition-all active:scale-[0.98]">
                                    <TrendingUp className="text-green-600" size={24} /> {newSaleLabel}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Seção: Navegação do Sistema */}
                          <div className="space-y-4">
                            <div className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                              <LayoutGrid size={14} /> Navegação
                            </div>
                            <div className="grid gap-2">
                              <Link href="/kanban" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 px-6 py-4 text-base font-bold text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                                <LayoutGrid size={22} className="text-gray-400" /> CRM Kanban
                              </Link>
                              {session?.role === "GlobalAdmin" && (
                                <Link href="/tenants" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 px-6 py-4 text-base font-bold text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                                  <Building size={22} className="text-gray-400" /> Gestão de Inquilinos
                                </Link>
                              )}
                              <Link href="/settings" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-4 px-6 py-4 text-base font-bold text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
                                <Settings size={22} className="text-gray-400" /> Configurações e LGPD
                              </Link>
                            </div>
                          </div>

                          {/* Seção: Trocar Conta (Tenant) - Mobile Only */}
                          {isMultiTenant && (
                            <div className="space-y-4">
                              <div className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Building size={14} /> Minhas Contas
                              </div>
                              <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {availableTenants.map((tenant) => {
                                   const isBlocked = tenant.is_blocked;
                                   return (
                                     <button
                                       key={tenant.id}
                                       disabled={isBlocked}
                                       aria-disabled={isBlocked}
                                       aria-label={`${tenant.nome_negocio}${isBlocked ? " · Bloqueado" : ""}`}
                                       onClick={() => {
                                         if (isBlocked) return;
                                         switchTenant(tenant.id);
                                         setIsMenuOpen(false);
                                       }}
                                       className={`flex items-center justify-between px-6 py-4 rounded-xl transition-all uppercase tracking-wider text-[11px] font-black ${
                                         isBlocked
                                           ? "opacity-40 cursor-not-allowed text-gray-400 bg-gray-50"
                                           : activeTenantId === tenant.id 
                                             ? "bg-primary-600 text-white shadow-lg" 
                                             : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                                       }`}
                                     >
                                       <span className="truncate">{tenant.nome_negocio}</span>
                                       {isBlocked ? (
                                         <span className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[9px] font-black uppercase ml-2 flex-shrink-0">
                                           Bloqueado
                                         </span>
                                       ) : (
                                         activeTenantId === tenant.id && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                       )}
                                     </button>
                                   );
                                 })}
                              </div>
                            </div>
                          )}

                          {/* Seção: Suporte e Integração */}
                          <div className="space-y-4">
                            <div className="text-[12px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                              <ExternalLink size={14} /> Externo
                            </div>
                            <div className="grid gap-2">
                              <a href="http://docs.unumpeople.com.br/crm/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 px-6 py-4 text-base font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">
                                <HelpCircle size={22} className="text-gray-400" /> Central de Ajuda
                              </a>
                            </div>
                          </div>

                          {/* Usuário e Sair */}
                          <div className="pt-4 border-t border-gray-100">
                            <div className="px-6 py-5 bg-gray-50 rounded-2xl mb-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-lg">
                                  {session?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-base font-black text-gray-900 truncate">{session?.name}</p>
                                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{session?.role}</p>
                                </div>
                              </div>
                            </div>
                            <button 
                              onClick={handleLogout}
                              className="w-full flex items-center gap-4 px-6 py-5 text-base font-bold text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                            >
                              <LogOut size={22} /> Sair do Sistema
                            </button>
                            <div className="mt-4 text-center">
                              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">v{pkg.version}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    {/* Desktop Dropdown */}
                    <motion.div 
                      className="hidden md:block absolute right-0 mt-3 w-80 bg-white border border-gray-100 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-20 overflow-hidden py-3 text-gray-900"
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {/* Seção: Ações de Vendas/Leads */}
                      {(onNewLead || onNewSale) && (
                        <div className="px-4 py-2 space-y-2">
                          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <Plus size={10} /> Operação
                          </div>
                          {onNewLead && (
                            <button onClick={() => { onNewLead(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-primary-700 bg-primary-50/50 hover:bg-primary-100 rounded-xl transition-all">
                              <Plus className="text-primary-600" size={20} /> {newLeadLabel}
                            </button>
                          )}
                          {onNewSale && (
                            <button onClick={() => { onNewSale(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-green-700 bg-green-50/50 hover:bg-green-100 rounded-xl transition-all">
                              <TrendingUp className="text-green-600" size={20} /> {newSaleLabel}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mx-4 my-2 border-t border-gray-50"></div>

                      {/* Seção: Navegação do Sistema */}
                      <div className="px-4 py-2 space-y-1">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                          <LayoutGrid size={10} /> Navegação
                        </div>
                        <Link href="/kanban" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                          <LayoutGrid size={18} className="text-gray-400" /> CRM Kanban
                        </Link>
                        {session?.role === "GlobalAdmin" && (
                          <Link href="/tenants" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                            <Building size={18} className="text-gray-400" /> Gestão de Inquilinos
                          </Link>
                        )}
                        <Link href="/settings" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
                          <Settings size={18} className="text-gray-400" /> Configurações e LGPD
                        </Link>
                      </div>

                      <div className="mx-4 my-2 border-t border-gray-50"></div>

                      {/* Seção: Suporte e Integração */}
                      <div className="px-4 py-2 space-y-1">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                          <ExternalLink size={10} /> Externo
                        </div>
                        <a href="http://docs.unumpeople.com.br/crm/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                          <HelpCircle size={18} className="text-gray-400" /> Central de Ajuda
                        </a>
                      </div>

                      <div className="mx-4 my-2 border-t border-gray-50"></div>

                      {/* Usuário e Sair */}
                      <div className="px-4 py-2">
                        <div className="px-4 py-3 bg-gray-50 rounded-xl mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-xs">
                              {session?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-gray-900 truncate">{session?.name}</p>
                              <p className="text-[9px] text-gray-500 uppercase font-bold">{session?.role}</p>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <LogOut size={18} /> Sair do Sistema
                        </button>
                        <div className="mt-2 text-center">
                          <span className="text-[9px] text-gray-400 font-medium uppercase tracking-widest">v{pkg.version}</span>
                        </div>
                      </div>

                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
