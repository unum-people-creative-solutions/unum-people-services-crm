import { StrictMode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEsperaDoPagamento } from './useEsperaDoPagamento';
import type { ResumoDeCobranca } from '@/types/cobranca';
import { resumoBloqueado, resumoEmAtraso, resumoEmDia } from '@/services/__fixtures__/cobranca';

// spec cobranca-e-plano-do-cliente RF2-33 e RF2-52 (sinal do CRM: "crm" saiu de
// ferramentas_bloqueadas); BP-T §5 e §15.3 "Liberação"; T42 no nível do hook.

const AGORA = new Date('2026-11-16T13:00:00Z').getTime();
const CHAVE = 'cobranca-aguardando:t1';

let visibilidade: DocumentVisibilityState = 'visible';

function mudarVisibilidade(v: DocumentVisibilityState) {
  visibilidade = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

type Props = { tenantId: string; resumo: ResumoDeCobranca | null };

function montar(recarregar: () => Promise<unknown>, inicial: Props = { tenantId: 't1', resumo: resumoBloqueado }) {
  return renderHook((p: Props) => useEsperaDoPagamento(p.tenantId, p.resumo, recarregar), { initialProps: inicial });
}

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  sessionStorage.clear();
  visibilidade = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEsperaDoPagamento (CRM)', () => {
  it('começa parado e não consulta sem clique', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    expect(result.current.estado).toBe('parado');
    expect(result.current.falhou).toBe(false);
    await avancar(60_000);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('iniciar grava a chave por empresa com o horário do clique e o vencimento, e passa a "aguardando"', () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    expect(result.current.estado).toBe('aguardando');
    expect(JSON.parse(sessionStorage.getItem(CHAVE)!)).toStrictEqual({ clicado_em: AGORA, vencimento: '2026-11-05' });
    // Nada além do horário e do vencimento (🔒 FE-P04).
    expect(Object.keys(sessionStorage)).toEqual([CHAVE]);
  });

  it('consulta a cada 15 s com a aba visível, não antes', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    await avancar(14_999);
    expect(recarregar).toHaveBeenCalledTimes(0);
    await avancar(1);
    expect(recarregar).toHaveBeenCalledTimes(1);
    await avancar(15_000);
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it('com a aba escondida não consulta por intervalo; ao voltar a ficar visível consulta na hora', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    act(() => mudarVisibilidade('hidden'));
    await avancar(45_000);
    expect(recarregar).toHaveBeenCalledTimes(0);
    act(() => mudarVisibilidade('visible'));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('consultas de foco: no máximo uma a cada 5 s', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(recarregar).toHaveBeenCalledTimes(1);
    await avancar(2_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
      mudarVisibilidade('visible');
    });
    expect(recarregar).toHaveBeenCalledTimes(1);
    await avancar(3_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it('aos 10 min para as consultas por intervalo, apaga a chave e passa a "sem_confirmacao"; o foco continua consultando', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    await avancar(599_999);
    expect(result.current.estado).toBe('aguardando');
    await avancar(1);
    expect(result.current.estado).toBe('sem_confirmacao');
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
    const consultasNoLimite = recarregar.mock.calls.length;
    expect(consultasNoLimite).toBeLessThanOrEqual(40);
    await avancar(60_000);
    expect(recarregar).toHaveBeenCalledTimes(consultasNoLimite);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(recarregar).toHaveBeenCalledTimes(consultasNoLimite + 1);
  });

  it('conferirAgora faz uma consulta na hora', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    await avancar(600_000);
    const antes = recarregar.mock.calls.length;
    act(() => result.current.conferirAgora());
    expect(recarregar).toHaveBeenCalledTimes(antes + 1);
  });

  it('confirmado: "crm" saiu de ferramentas_bloqueadas → "confirmado" e a chave é apagada', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    rerender({ tenantId: 't1', resumo: resumoEmDia });
    expect(result.current.estado).toBe('confirmado');
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
    await avancar(60_000);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it('confirmado também com a conta ainda em atraso, mas com o CRM liberado (R6 de volta a INADIMPLENTE)', () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    rerender({ tenantId: 't1', resumo: resumoEmAtraso });
    expect(result.current.estado).toBe('confirmado');
  });

  it('continua bloqueado com o mesmo vencimento → continua "aguardando"', () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    rerender({ tenantId: 't1', resumo: { ...resumoBloqueado } });
    expect(result.current.estado).toBe('aguardando');
  });

  it('parcial (R6): continua bloqueado com outro fatura.vencimento → "parcial", com o vencimento guardado, e a chave é apagada', () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    // Antes do pagamento parcial, como a API monta: fatura = OVERDUE mais antiga
    // (RF2-08) e vencida_em = DelinquencySince = o vencimento dela (RF1-20), com
    // as demais datas contadas dele. Depois: resumoBloqueado (resta a de 05/11).
    const comDuasVencidas: ResumoDeCobranca = {
      ...resumoBloqueado,
      fatura: { valor: 39.9, vencimento: '2026-10-05', link: 'https://www.asaas.com/i/def' },
      vencida_em: '2026-10-05',
      pagar_ate: '2026-10-14',
      bloqueio_em: '2026-10-15',
      fora_do_ar_em: '2026-11-04',
      cancelamento_em: '2026-12-04',
    };
    const { result, rerender } = montar(recarregar, { tenantId: 't1', resumo: comDuasVencidas });
    act(() => result.current.iniciar('2026-10-05'));
    rerender({ tenantId: 't1', resumo: resumoBloqueado });
    expect(result.current.estado).toBe('parcial');
    expect(result.current.vencimentoPago).toBe('2026-10-05');
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
  });

  it('três consultas seguidas com falha → falhou; um sucesso zera', async () => {
    const recarregar = vi.fn().mockRejectedValue(new Error('rede'));
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    await avancar(30_000);
    expect(recarregar).toHaveBeenCalledTimes(2);
    expect(result.current.falhou).toBe(false);
    await avancar(15_000);
    expect(result.current.falhou).toBe(true);
    // A falha não interrompe a espera.
    expect(result.current.estado).toBe('aguardando');
    recarregar.mockResolvedValue(undefined);
    await avancar(15_000);
    expect(result.current.falhou).toBe(false);
  });

  it('recarregar a página com a chave guardada retoma a espera, e o limite conta do clique', async () => {
    sessionStorage.setItem(CHAVE, JSON.stringify({ clicado_em: AGORA - 60_000, vencimento: '2026-11-05' }));
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    expect(result.current.estado).toBe('aguardando');
    await avancar(15_000);
    expect(recarregar).toHaveBeenCalledTimes(1);
    await avancar(524_999);
    expect(result.current.estado).toBe('aguardando');
    await avancar(1);
    expect(result.current.estado).toBe('sem_confirmacao');
  });

  it('chave guardada de outra empresa não vale; trocar de empresa lê a chave da empresa nova', () => {
    sessionStorage.setItem('cobranca-aguardando:t2', JSON.stringify({ clicado_em: AGORA - 1_000, vencimento: '2026-11-05' }));
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = montar(recarregar);
    expect(result.current.estado).toBe('parado');
    rerender({ tenantId: 't2', resumo: resumoBloqueado });
    expect(result.current.estado).toBe('aguardando');
    rerender({ tenantId: 't1', resumo: resumoBloqueado });
    expect(result.current.estado).toBe('parado');
  });

  // L3 do Verifier F2: recarregar depois dos 10 min dá o mesmo desfecho dos 10 min
  // com a página aberta, como no Portal (também com os efeitos rodando duas vezes).
  it('recarregar depois dos 10 min: "sem_confirmacao", chave apagada e sem consultas por intervalo', async () => {
    sessionStorage.setItem(CHAVE, JSON.stringify({ clicado_em: AGORA - 600_001, vencimento: '2026-11-05' }));
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEsperaDoPagamento('t1', resumoBloqueado, recarregar), { wrapper: StrictMode });
    expect(result.current.estado).toBe('sem_confirmacao');
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
    await avancar(60_000);
    expect(recarregar).not.toHaveBeenCalled();
    expect(result.current.estado).toBe('sem_confirmacao');
  });

  it('troca de empresa: a espera vencida de uma não apaga a chave da outra', () => {
    sessionStorage.setItem(CHAVE, JSON.stringify({ clicado_em: AGORA - 11 * 60_000, vencimento: '2026-11-05' }));
    sessionStorage.setItem('cobranca-aguardando:t2', JSON.stringify({ clicado_em: AGORA - 60_000, vencimento: '2026-11-05' }));
    const { result, rerender } = montar(vi.fn().mockResolvedValue(undefined));
    expect(result.current.estado).toBe('sem_confirmacao');

    rerender({ tenantId: 't2', resumo: resumoBloqueado });
    expect(result.current.estado).toBe('aguardando');
    expect(sessionStorage.getItem('cobranca-aguardando:t2')).not.toBeNull();
  });

  it('fechar apaga a chave e volta a "parado"', async () => {
    const recarregar = vi.fn().mockResolvedValue(undefined);
    const { result } = montar(recarregar);
    act(() => result.current.iniciar('2026-11-05'));
    act(() => result.current.fechar());
    expect(result.current.estado).toBe('parado');
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
    await avancar(30_000);
    expect(recarregar).not.toHaveBeenCalled();
  });
});
