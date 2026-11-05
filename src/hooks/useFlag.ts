'use client';

import { useEffect, useRef, useState } from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { FlagsService } from '@/services/api';

// Feature flag da empresa ativa (crm-agendamento-e-lembretes RF-77). Vale false
// enquanto carrega, sem empresa e quando a leitura falha: a flag que não carregou
// esconde a funcionalidade nova, e o quadro antigo continua completo. A falha vai
// só para o console (mesma exceção declarada do useFlag do lp-builder).
export function useFlag(chave: string): boolean {
  const { activeTenantId } = useTenant();
  const [empresa, setEmpresa] = useState(activeTenantId);
  const [ligada, setLigada] = useState(false);
  const pedidoAtual = useRef(0);

  // Troca de empresa: desliga na hora até a leitura nova.
  if (empresa !== activeTenantId) {
    setEmpresa(activeTenantId);
    setLigada(false);
  }

  useEffect(() => {
    const pedido = ++pedidoAtual.current;
    if (!activeTenantId) return;

    FlagsService.get(activeTenantId)
      .then((flags) => {
        // Só a leitura mais recente entra no estado.
        if (pedido !== pedidoAtual.current) return;
        setLigada(flags?.[chave] === true);
      })
      .catch((err) => {
        if (pedido !== pedidoAtual.current) return;
        console.error('Falha ao ler as feature flags', err);
        setLigada(false);
      });
  }, [activeTenantId, chave]);

  return ligada;
}
