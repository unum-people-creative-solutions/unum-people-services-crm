'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { AcessosService } from '@/services/api';

export type PermissaoDoCRM =
  | 'crm.lead.ver'
  | 'crm.lead.criar'
  | 'crm.lead.editar'
  | 'crm.lead.excluir'
  | 'crm.integracoes.gerir';

export type PermissaoDoPortal = 'portal.usuarios.gerir';

interface AcessosState {
  carregando: boolean;
  erro: boolean;
  pode: (p: PermissaoDoCRM) => boolean;
  podeNoPortal: (p: PermissaoDoPortal) => boolean;
}

// Fora do provider: negar, nunca liberar.
const semAcesso: AcessosState = {
  carregando: false,
  erro: false,
  pode: () => false,
  podeNoPortal: () => false,
};

const AcessosContext = createContext<AcessosState>(semAcesso);

export function AcessosProvider({ children }: { children: ReactNode }): JSX.Element {
  const { activeTenantId } = useTenant();
  const [empresa, setEmpresa] = useState(activeTenantId);
  const [carregando, setCarregando] = useState(Boolean(activeTenantId));
  const [erro, setErro] = useState(false);
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [permissoesDoPortal, setPermissoesDoPortal] = useState<string[]>([]);
  const pedidoAtual = useRef(0);

  // Troca de empresa: zera na hora e fica carregando até a leitura nova.
  if (empresa !== activeTenantId) {
    setEmpresa(activeTenantId);
    setCarregando(Boolean(activeTenantId));
    setErro(false);
    setPermissoes([]);
    setPermissoesDoPortal([]);
  }

  useEffect(() => {
    const pedido = ++pedidoAtual.current;

    // Sem empresa ativa não chama a API.
    if (!activeTenantId) return;

    setCarregando(true);

    AcessosService.get(activeTenantId)
      .then((dados) => {
        // Só a leitura mais recente entra no estado.
        if (pedido !== pedidoAtual.current) return;
        const doCrm = dados.ferramentas.find((f) => f.id === 'crm')?.permissoes ?? [];
        const doPortal = dados.ferramentas.find((f) => f.id === 'portal')?.permissoes ?? [];
        setPermissoes(doCrm);
        setPermissoesDoPortal(doPortal);
        setErro(false);
        setCarregando(false);
      })
      .catch(() => {
        if (pedido !== pedidoAtual.current) return;
        setPermissoes([]);
        setPermissoesDoPortal([]);
        setErro(true);
        setCarregando(false);
      });
  }, [activeTenantId]);

  const pode = (p: PermissaoDoCRM) => {
    if (carregando || erro || !activeTenantId) return false;
    return permissoes.includes(p);
  };

  const podeNoPortal = (p: PermissaoDoPortal) => {
    if (carregando || erro || !activeTenantId) return false;
    return permissoesDoPortal.includes(p);
  };

  return (
    <AcessosContext.Provider value={{ carregando, erro, pode, podeNoPortal }}>
      {children}
    </AcessosContext.Provider>
  );
}

export function useAcessosDoCRM(): { carregando: boolean; erro: boolean; pode: (p: PermissaoDoCRM) => boolean; podeNoPortal: (p: PermissaoDoPortal) => boolean } {
  return useContext(AcessosContext);
}
