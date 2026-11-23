'use client';

import { useEffect, useRef, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { OrigensService, type Origens } from '@/services/api';

export interface EstadoDasOrigens {
  origens: Origens | null;
  carregando: boolean;
  erro: boolean;
  recarregar: () => void;
  substituir: (o: Origens) => void;
}

// Origens do lead da empresa ativa (spec crm-origens-personalizadas). Mesmo desenho do useFunil:
// troca de empresa descarta a resposta atrasada. Quem usa a lista chama o hook uma vez e repassa o
// estado, para os campos da tela mostrarem sempre a mesma lista.
export function useOrigens(): EstadoDasOrigens {
  const { activeTenantId } = useTenant();
  const [empresa, setEmpresa] = useState(activeTenantId);
  const [origens, setOrigens] = useState<Origens | null>(null);
  const [carregando, setCarregando] = useState(Boolean(activeTenantId));
  const [erro, setErro] = useState(false);
  const pedidoAtual = useRef(0);
  const [geracao, setGeracao] = useState(0);

  // Troca de empresa: a lista anterior sai na hora, antes da leitura nova.
  if (empresa !== activeTenantId) {
    setEmpresa(activeTenantId);
    setOrigens(null);
    setErro(false);
    setCarregando(Boolean(activeTenantId));
  }

  useEffect(() => {
    const pedido = ++pedidoAtual.current;
    if (!activeTenantId) {
      setCarregando(false);
      setOrigens(null);
      setErro(false);
      return;
    }

    setCarregando(true);
    setErro(false);
    OrigensService.ler(activeTenantId)
      .then((lida) => {
        if (pedido !== pedidoAtual.current) return;
        setOrigens(lida);
        setErro(false);
        setCarregando(false);
      })
      .catch(() => {
        if (pedido !== pedidoAtual.current) return;
        setOrigens(null);
        setErro(true);
        setCarregando(false);
      });
  }, [activeTenantId, geracao]);

  const recarregar = () => setGeracao((atual) => atual + 1);

  const substituir = (o: Origens) => {
    pedidoAtual.current += 1;
    setOrigens(o);
    setErro(false);
    setCarregando(false);
  };

  return { origens, carregando, erro, recarregar, substituir };
}
