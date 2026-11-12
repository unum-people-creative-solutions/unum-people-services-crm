import { describe, it, expect } from 'vitest';
import { mensagemDoAdiar, retomarPendenteNoFuturo, venceEmDaData, venceEmDoAtalho } from './adiar';
import { MENSAGEM_SEM_PERMISSAO } from '@/services/api';

// spec crm-funil-e-atividades-f4. "agora" = 2026-11-12T15:00:00Z (12:00 em Brasília).
const agora = new Date('2026-11-12T15:00:00Z');

const item = (tipo: string, vence_em: string, situacao = 'pendente') => ({ id: vence_em, tipo, situacao, vence_em });

describe('atalhos às 9h de Brasília', () => {
  it('amanhã, em 1 semana e em 1 mês', () => {
    expect(venceEmDoAtalho('amanha', agora)).toBe('2026-11-13T12:00:00Z');
    expect(venceEmDoAtalho('semana', agora)).toBe('2026-11-19T12:00:00Z');
    expect(venceEmDoAtalho('mes', agora)).toBe('2026-12-12T12:00:00Z');
  });

  it('1 mês a partir de 31 de janeiro cai no último dia de fevereiro', () => {
    expect(venceEmDoAtalho('mes', new Date('2026-01-31T15:00:00Z'))).toBe('2026-02-28T12:00:00Z');
    expect(venceEmDoAtalho('mes', new Date('2024-01-31T15:00:00Z'))).toBe('2024-02-29T12:00:00Z');
  });

  it('data sem hora grava 09:00; com hora, usa a escolhida', () => {
    expect(venceEmDaData('2026-11-20', '')).toBe('2026-11-20T12:00:00Z');
    expect(venceEmDaData('2026-11-20', undefined)).toBe('2026-11-20T12:00:00Z');
    expect(venceEmDaData('2026-11-20', '15:45')).toBe('2026-11-20T18:45:00Z');
  });
});

describe('retomar pendente no futuro', () => {
  it('só a retomar pendente com vence_em depois de agora; na hora exata o lead volta', () => {
    expect(retomarPendenteNoFuturo([
      item('ligar', '2026-11-20T15:00:00Z'),
      item('retomar', '2026-11-12T15:00:00Z'),
      item('retomar', '2026-11-20T15:00:00Z', 'feita'),
      item('retomar', '2026-12-01T12:00:00Z'),
    ], agora)?.vence_em).toBe('2026-12-01T12:00:00Z');
    expect(retomarPendenteNoFuturo([item('retomar', '2026-11-12T12:00:00Z')], agora)).toBeNull();
    expect(retomarPendenteNoFuturo(undefined, agora)).toBeNull();
  });
});

describe('erros de adiar', () => {
  it('400 adiar_invalido e 409 adiar_indisponivel', () => {
    expect(mensagemDoAdiar({ response: { status: 400, data: { error: 'adiar_invalido', motivo: 'vence_em' } } }))
      .toBe('Não foi possível adiar: vence_em.');
    expect(mensagemDoAdiar({ response: { status: 400, data: { error: 'adiar_invalido' } } }))
      .toBe('Não foi possível adiar.');
    expect(mensagemDoAdiar({ response: { status: 409, data: { error: 'adiar_indisponivel' } } }))
      .toBe('Não é possível adiar este lead.');
  });

  it('403 recurso_desligado e 403 com permissão', () => {
    expect(mensagemDoAdiar({ response: { status: 403, data: { error: 'recurso_desligado' } } }))
      .toBe('Recurso desligado.');
    expect(mensagemDoAdiar({ response: { status: 403, data: { permissao: 'crm.lead.editar' } } }))
      .toBe(MENSAGEM_SEM_PERMISSAO);
  });
});
