"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { TenantService } from '@/services/api';
import { ACTIVE_TENANT_CHANGE_EVENT, ACTIVE_TENANT_KEY } from '@/lib/activeTenant';

interface Tenant {
  id: string;
  nome_negocio: string;
  is_blocked?: boolean;
}

interface TenantContextValue {
  activeTenantId: string;
  activeTenantName: string;
  availableTenants: Tenant[];
  isMultiTenant: boolean;
  switchTenant: (id: string) => void;
  isLoadingTenants: boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuthStore();
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);

  // Inicializa activeTenantId preferindo o sessionStorage, senão a session do useAuthStore
  const [activeTenantId, setActiveTenantId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('active-tenant');
      if (saved) return saved;
    }
    return session?.tenantId || '';
  });

  // Sincroniza com a session se mudar e não tivermos nada no sessionStorage
  useEffect(() => {
    if (session?.tenantId && typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('active-tenant');
      if (!saved) {
        setActiveTenantId(session.tenantId);
      }
    }
  }, [session?.tenantId]);

  // Grava toda mudança, inclusive a escolha automática, e avisa o
  // PendingTermsGate, que fica fora deste provider e lê o sessionStorage.
  useEffect(() => {
    if (!activeTenantId || typeof window === 'undefined') return;
    sessionStorage.setItem(ACTIVE_TENANT_KEY, activeTenantId);
    window.dispatchEvent(new CustomEvent(ACTIVE_TENANT_CHANGE_EVENT, { detail: activeTenantId }));
  }, [activeTenantId]);

  const loadTenants = useCallback(async () => {
    setIsLoadingTenants(true);
    try {
      const userRole = session?.role;
      let data = userRole === 'GlobalAdmin'
        ? await TenantService.list()
        : await TenantService.listMyTenants('crm');
      
      const list = data || [];
      // Ordena para que os bloqueados fiquem no final
      const sortedList = [...list].sort((a: any, b: any) => Number(a.is_blocked || false) - Number(b.is_blocked || false));
      setAvailableTenants(sortedList);
      
      // Se já temos um activeTenantId, verifica se ele existe na lista. Se não, seleciona o primeiro disponível não-bloqueado
      if (sortedList.length > 0) {
        const hasActiveInList = sortedList.some((t: any) => t.id === activeTenantId);
        if (!activeTenantId || !hasActiveInList) {
          const firstNonBlocked = sortedList.find((t: any) => !t.is_blocked) || sortedList[0];
          setActiveTenantId(firstNonBlocked.id);
        }
      }
    } catch (error) {
      console.error('Error loading tenants in context:', error);
    } finally {
      setIsLoadingTenants(false);
    }
  }, [session]);


  useEffect(() => {
    loadTenants();
  }, [session?.token]); // Dispara no mount ou quando o token mudar

  const switchTenant = useCallback((id: string) => {
    // Proteger contra troca para inquilino bloqueado
    const tenant = availableTenants.find(t => t.id === id);
    if (tenant?.is_blocked) {
      return;
    }

    setActiveTenantId(id);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('active-tenant', id);
    }
  }, [availableTenants]);

  const activeTenantName = useMemo(() => {
    const found = availableTenants.find(t => t.id === activeTenantId);
    if (found) return found.nome_negocio;
    if (session && activeTenantId === session.tenantId && session.tenantName) {
      return session.tenantName;
    }
    return '';
  }, [activeTenantId, availableTenants, session]);

  const isMultiTenant = useMemo(() => {
    return availableTenants.length > 1;
  }, [availableTenants]);

  const value = useMemo<TenantContextValue>(() => ({
    activeTenantId,
    activeTenantName,
    availableTenants,
    isMultiTenant,
    switchTenant,
    isLoadingTenants,
  }), [activeTenantId, activeTenantName, availableTenants, isMultiTenant, switchTenant, isLoadingTenants]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
