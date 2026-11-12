import { describe, it, expect } from 'vitest';
import {
  TIPOS_DE_ATIVIDADE,
  proximaPendente,
  rotuloDaAtividade,
  temPendenteHoje,
  temPendenteNoFuturo,
} from './atividades';

// spec crm-funil-e-atividades-f3, decisões de 12/11/2026. "agora" = 12:00 em Brasília.
const agora = new Date('2026-11-12T15:00:00Z');

const item = (tipo: string, vence_em: string, situacao = 'pendente') => ({ id: vence_em, tipo, situacao, vence_em });

describe('rótulos dos tipos', () => {
  it('consulta Consulta, ligar Ligar, whatsapp WhatsApp, email E-mail, reuniao Reunião, tarefa Tarefa, retomar Retomar contato', () => {
    expect(TIPOS_DE_ATIVIDADE.map((tipo) => [tipo.valor, tipo.rotulo])).toEqual([
      ['consulta', 'Consulta'],
      ['ligar', 'Ligar'],
      ['whatsapp', 'WhatsApp'],
      ['email', 'E-mail'],
      ['reuniao', 'Reunião'],
      ['tarefa', 'Tarefa'],
      ['retomar', 'Retomar contato'],
    ]);
    expect(rotuloDaAtividade('retomar')).toBe('Retomar contato');
  });
});

describe('próxima atividade pendente', () => {
  it('é a de vence_em mais cedo; feita e cancelada não entram', () => {
    const itens = [
      item('tarefa', '2026-11-12T21:00:00Z'),
      item('ligar', '2026-11-12T12:00:00Z', 'feita'),
      item('consulta', '2026-11-12T16:00:00Z'),
      item('email', '2026-11-12T13:00:00Z', 'cancelada'),
    ];
    expect(proximaPendente(itens)?.tipo).toBe('consulta');
  });

  it('sem pendente devolve null', () => {
    expect(proximaPendente([item('ligar', '2026-11-12T12:00:00Z', 'feita')])).toBeNull();
    expect(proximaPendente(undefined)).toBeNull();
  });
});

describe('vence no dia de Brasília', () => {
  it('23:30 de Brasília ainda é hoje; 00:00 do dia seguinte não', () => {
    const noite = [item('ligar', '2026-11-13T02:30:00Z')];
    const virada = [item('ligar', '2026-11-13T03:00:00Z')];
    expect(temPendenteHoje(noite, agora)).toBe(true);
    expect(temPendenteHoje(virada, agora)).toBe(false);
  });

  it('feita no mesmo dia não conta', () => {
    expect(temPendenteHoje([item('consulta', '2026-11-12T16:00:00Z', 'feita')], agora)).toBe(false);
  });
});

describe('pendente no futuro não é parado', () => {
  it('vence_em depois de agora isenta; no passado, não', () => {
    expect(temPendenteNoFuturo([item('retomar', '2026-11-20T15:00:00Z')], agora)).toBe(true);
    expect(temPendenteNoFuturo([item('ligar', '2026-11-12T12:00:00Z')], agora)).toBe(false);
    expect(temPendenteNoFuturo([item('retomar', '2026-11-20T15:00:00Z', 'feita')], agora)).toBe(false);
  });
});
