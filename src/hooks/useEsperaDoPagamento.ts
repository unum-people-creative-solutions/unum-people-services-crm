"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResumoDeCobranca } from '@/types/cobranca';

// Espera do pagamento depois de "Pagar fatura" (spec cobranca-e-plano-do-cliente
// RF2-33, BP-T §5). No CRM o sinal de confirmado é "crm saiu de
// ferramentas_bloqueadas" (RF2-52).

export type EstadoDaEspera = 'parado' | 'aguardando' | 'confirmado' | 'parcial' | 'sem_confirmacao';

export interface EsperaDoPagamento {
  estado: EstadoDaEspera;
  falhou: boolean;
  // Vencimento guardado no clique: a tela cita "a fatura de DD/MM" no estado "parcial".
  vencimentoPago: string | null;
  iniciar: (vencimento: string) => void;
  conferirAgora: () => void;
  fechar: () => void;
}

const INTERVALO_MS = 15_000;
const FOCO_MIN_MS = 5_000;
const LIMITE_MS = 10 * 60_000;
const FALHAS_PARA_AVISO = 3;

interface Guardado {
  clicado_em: number;
  vencimento: string;
}

const chave = (tenantId: string) => `cobranca-aguardando:${tenantId}`;

function removerChave(tenantId: string) {
  try {
    sessionStorage.removeItem(chave(tenantId));
  } catch {
    // sessionStorage indisponível: não há o que apagar.
  }
}

// Chave guardada e ainda dentro dos 10 min do clique; vencida ou ilegível é apagada.
function lerGuardado(tenantId: string): Guardado | null {
  if (typeof window === 'undefined' || !tenantId) return null;
  let guardado: Guardado | null = null;
  try {
    const bruto = sessionStorage.getItem(chave(tenantId));
    if (!bruto) return null;
    guardado = JSON.parse(bruto) as Guardado;
  } catch {
    guardado = null;
  }
  if (
    !guardado ||
    typeof guardado.clicado_em !== 'number' ||
    typeof guardado.vencimento !== 'string' ||
    Date.now() - guardado.clicado_em >= LIMITE_MS
  ) {
    removerChave(tenantId);
    return null;
  }
  return guardado;
}

interface Espera {
  estado: EstadoDaEspera;
  guardado: Guardado | null;
}

function esperaDaChave(tenantId: string): Espera {
  const guardado = lerGuardado(tenantId);
  return { estado: guardado ? 'aguardando' : 'parado', guardado };
}

export function useEsperaDoPagamento(
  tenantId: string,
  resumo: ResumoDeCobranca | null,
  recarregar: () => Promise<unknown>
): EsperaDoPagamento {
  const [espera, setEspera] = useState<Espera>(() => esperaDaChave(tenantId));
  const [falhas, setFalhas] = useState(0);
  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;
  const ultimaDeFocoRef = useRef(Number.NEGATIVE_INFINITY);
  const tenantAnteriorRef = useRef(tenantId);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // Troca de empresa: a espera é a da chave da empresa nova.
  useEffect(() => {
    if (tenantAnteriorRef.current === tenantId) return;
    tenantAnteriorRef.current = tenantId;
    setEspera(esperaDaChave(tenantId));
    setFalhas(0);
  }, [tenantId]);

  const consultar = useCallback(() => {
    recarregarRef.current().then(
      () => {
        if (montadoRef.current) setFalhas(0);
      },
      () => {
        if (montadoRef.current) setFalhas((f) => f + 1);
      }
    );
  }, []);

  const { estado, guardado } = espera;

  // A cada 15 s com a aba visível, até 10 min depois do clique.
  useEffect(() => {
    if (estado !== 'aguardando' || !guardado) return;
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') consultar();
    }, INTERVALO_MS);
    const limite = setTimeout(() => {
      removerChave(tenantId);
      setEspera((e) => ({ ...e, estado: 'sem_confirmacao' }));
    }, Math.max(0, guardado.clicado_em + LIMITE_MS - Date.now()));
    return () => {
      clearInterval(intervalo);
      clearTimeout(limite);
    };
  }, [estado, guardado, tenantId, consultar]);

  // Ao voltar o foco ou a visibilidade: consulta na hora, no máximo uma vez a cada 5 s.
  useEffect(() => {
    if (estado !== 'aguardando' && estado !== 'sem_confirmacao') return;
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      const agora = Date.now();
      if (agora - ultimaDeFocoRef.current < FOCO_MIN_MS) return;
      ultimaDeFocoRef.current = agora;
      consultar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [estado, consultar]);

  // Desfechos pelo resumo mais recente.
  useEffect(() => {
    if (!resumo || (estado !== 'aguardando' && estado !== 'sem_confirmacao')) return;
    if (!resumo.ferramentas_bloqueadas.includes('crm')) {
      removerChave(tenantId);
      setEspera((e) => ({ ...e, estado: 'confirmado' }));
      return;
    }
    if (resumo.fatura && guardado && resumo.fatura.vencimento !== guardado.vencimento) {
      removerChave(tenantId);
      setEspera((e) => ({ ...e, estado: 'parcial' }));
    }
  }, [resumo, estado, guardado, tenantId]);

  const iniciar = useCallback(
    (vencimento: string) => {
      const novo: Guardado = { clicado_em: Date.now(), vencimento };
      try {
        sessionStorage.setItem(chave(tenantId), JSON.stringify(novo));
      } catch {
        // Sem sessionStorage a espera vale só enquanto a página estiver aberta.
      }
      setEspera({ estado: 'aguardando', guardado: novo });
      setFalhas(0);
    },
    [tenantId]
  );

  const fechar = useCallback(() => {
    removerChave(tenantId);
    setEspera({ estado: 'parado', guardado: null });
    setFalhas(0);
  }, [tenantId]);

  return {
    estado,
    falhou: falhas >= FALHAS_PARA_AVISO,
    vencimentoPago: guardado?.vencimento ?? null,
    iniciar,
    conferirAgora: consultar,
    fechar,
  };
}
