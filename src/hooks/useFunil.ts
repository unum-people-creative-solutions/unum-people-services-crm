'use client';

import { useEffect, useRef, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { FunilService, type Funil } from '@/services/api';

// Funil da empresa ativa (spec crm-funil-e-atividades-f1, FUN-02 e FUN-04).
// Troca de empresa descarta a resposta atrasada, no mesmo pedidoAtual do useFlag.
export function useFunil(): {
  funil: Funil | null;
  carregando: boolean;
  erro: boolean;
  recarregar: () => void;
  substituir: (f: Funil) => void;
} {
  const { activeTenantId } = useTenant();
  const [empresa, setEmpresa] = useState(activeTenantId);
  const [funil, setFunil] = useState<Funil | null>(null);
  const [carregando, setCarregando] = useState(Boolean(activeTenantId));
  const [erro, setErro] = useState(false);
  const pedidoAtual = useRef(0);
  const [geracao, setGeracao] = useState(0);

  // Troca de empresa: o funil anterior sai na hora, antes da leitura nova.
  if (empresa !== activeTenantId) {
    setEmpresa(activeTenantId);
    setFunil(null);
    setErro(false);
    setCarregando(Boolean(activeTenantId));
  }

  useEffect(() => {
    const pedido = ++pedidoAtual.current;
    if (!activeTenantId) {
      setCarregando(false);
      setFunil(null);
      setErro(false);
      return;
    }

    setCarregando(true);
    setErro(false);
    FunilService.ler(activeTenantId)
      .then((lido) => {
        if (pedido !== pedidoAtual.current) return;
        setFunil(lido);
        setErro(false);
        setCarregando(false);
      })
      .catch(() => {
        if (pedido !== pedidoAtual.current) return;
        setFunil(null);
        setErro(true);
        setCarregando(false);
      });
  }, [activeTenantId, geracao]);

  const recarregar = () => setGeracao((atual) => atual + 1);

  const substituir = (f: Funil) => {
    pedidoAtual.current += 1;
    setFunil(f);
    setErro(false);
    setCarregando(false);
  };

  return { funil, carregando, erro, recarregar, substituir };
}
