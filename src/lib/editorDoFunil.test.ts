import { describe, it, expect } from 'vitest';
import type { Funil } from '@/services/api';
import funilPadraoJson from '@/services/__fixtures__/get-crm-funil-padrao.json';
import {
  LIMITE_DE_ETAPAS,
  adicionar,
  iniciar,
  limitesDeMovimento,
  mover,
  moverParaDireita,
  moverParaEsquerda,
  definirAcao,
  paraPedido,
  podeAdicionar,
  remover,
  renomear,
  type Rascunho,
} from './editorDoFunil';

// spec: crm-funil-e-atividades-f1 FUN-12, FUN-13, FUN-14, premissas A1 e A3 (T23).

const padrao = funilPadraoJson as Funil;
const idsDoPadrao = ['NOVO', 'ATENDIMENTO', 'AGENDADO', 'GANHO', 'PERDIDO'];

function rotulos(r: Rascunho): string[] {
  return r.etapas.map((etapa) => (etapa.nova ? etapa.nome : etapa.id));
}

function etapaNova(r: Rascunho) {
  const etapa = r.etapas.find((item) => item.nova);
  if (!etapa) throw new Error('etapa nova ausente');
  return etapa;
}

describe('editor do funil', () => {
  it('iniciar copia a versão e as etapas, com chave igual ao id', () => {
    const r = iniciar(padrao);
    expect(r.versao).toBe(0);
    expect(r.etapas.map((e) => e.id)).toEqual(idsDoPadrao);
    expect(r.etapas.map((e) => e.chave)).toEqual(idsDoPadrao);
    expect(r.etapas.map((e) => e.nome)).toEqual([
      'Novos Leads', 'Em Atendimento', 'Agendados', 'Ganho (Conversão)', 'Perdido',
    ]);
    expect(r.etapas.map((e) => e.papel)).toEqual(['novo', 'comum', 'agendado', 'ganho', 'perdido']);
    expect(r.etapas.map((e) => [e.removivel, e.movivel])).toEqual([
      [false, false],
      [true, true],
      [false, true],
      [false, false],
      [false, false],
    ]);
    expect(r.etapas.every((e) => e.nova === undefined)).toBe(true);
  });

  it('adicionar insere Nova etapa imediatamente antes de Ganho', () => {
    const r = adicionar(iniciar(padrao));
    expect(rotulos(r)).toEqual([
      'NOVO', 'ATENDIMENTO', 'AGENDADO', 'Nova etapa', 'GANHO', 'PERDIDO',
    ]);
    const nova = etapaNova(r);
    expect(nova.papel).toBe('comum');
    expect(nova.removivel).toBe(true);
    expect(nova.movivel).toBe(true);
    expect(r.etapas[r.etapas.indexOf(nova) + 1].papel).toBe('ganho');
    expect(new Set(r.etapas.map((e) => e.chave)).size).toBe(r.etapas.length);
  });

  it('se o nome já existe, a próxima é Nova etapa 2 e depois Nova etapa 3', () => {
    const tres = adicionar(adicionar(adicionar(iniciar(padrao))));
    expect(rotulos(tres)).toEqual([
      'NOVO', 'ATENDIMENTO', 'AGENDADO', 'Nova etapa', 'Nova etapa 2', 'Nova etapa 3', 'GANHO', 'PERDIDO',
    ]);

    const jaExiste = adicionar(renomear(iniciar(padrao), 'ATENDIMENTO', 'Nova etapa'));
    expect(jaExiste.etapas.map((e) => e.nome)).toEqual([
      'Novos Leads', 'Nova etapa', 'Agendados', 'Nova etapa 2', 'Ganho (Conversão)', 'Perdido',
    ]);
  });

  it('recusa a 11ª coluna e podeAdicionar acompanha o limite de 10', () => {
    expect(LIMITE_DE_ETAPAS).toBe(10);
    expect(podeAdicionar(iniciar(padrao))).toBe(true);

    let r = iniciar(padrao);
    for (let i = 0; i < 4; i += 1) r = adicionar(r);
    expect(r.etapas).toHaveLength(9);
    expect(podeAdicionar(r)).toBe(true);

    r = adicionar(r);
    expect(r.etapas).toHaveLength(10);
    expect(podeAdicionar(r)).toBe(false);
    expect(adicionar(r)).toEqual(r);
    expect(r.etapas[0].id).toBe('NOVO');
    expect(r.etapas[r.etapas.length - 2].papel).toBe('ganho');
    expect(r.etapas[r.etapas.length - 1].papel).toBe('perdido');
  });

  it('renomear troca só o nome da coluna', () => {
    const r = renomear(iniciar(padrao), 'NOVO', 'Entrada');
    expect(r.etapas.map((e) => e.nome)).toEqual([
      'Entrada', 'Em Atendimento', 'Agendados', 'Ganho (Conversão)', 'Perdido',
    ]);
    expect(r.etapas.map((e) => e.id)).toEqual(idsDoPadrao);
    expect(paraPedido(r)[0]).toEqual({ id: 'NOVO', nome: 'Entrada', acao: 'nenhuma' });
  });

  it('remover tira só a coluna removível', () => {
    expect(remover(iniciar(padrao), 'ATENDIMENTO').etapas.map((e) => e.id)).toEqual([
      'NOVO', 'AGENDADO', 'GANHO', 'PERDIDO',
    ]);

    const comNova = adicionar(iniciar(padrao));
    expect(rotulos(remover(comNova, etapaNova(comNova).chave))).toEqual(idsDoPadrao);
  });

  it.each(['NOVO', 'AGENDADO', 'GANHO', 'PERDIDO'])('não remove %s', (id) => {
    const r = iniciar(padrao);
    expect(remover(r, id)).toEqual(r);
  });

  it('mover(1, 2) reordena e recusa destino antes de Novo ou a partir de Ganho', () => {
    const r = iniciar(padrao);
    const ganho = r.etapas.findIndex((e) => e.papel === 'ganho');
    expect(limitesDeMovimento(r)).toEqual({ min: 1, max: ganho - 1 });
    expect(ganho).toBe(3);

    expect(rotulos(mover(r, 1, 2))).toEqual(['NOVO', 'AGENDADO', 'ATENDIMENTO', 'GANHO', 'PERDIDO']);
    expect(mover(r, 1, 2).versao).toBe(0);
    expect(mover(r, 1, 2).etapas[0].id).toBe('NOVO');
    expect(mover(r, 1, 2).etapas[3].id).toBe('GANHO');
    expect(mover(r, 1, 2).etapas[4].id).toBe('PERDIDO');

    expect(mover(r, 1, 0)).toEqual(r);
    expect(mover(r, 1, ganho)).toEqual(r);
    expect(mover(r, 1, ganho + 1)).toEqual(r);
    expect(mover(r, 0, 1)).toEqual(r);
    expect(mover(r, ganho, 1)).toEqual(r);
    expect(mover(r, ganho + 1, 2)).toEqual(r);
  });

  it('as setas trocam com a vizinha e param em Novo e em Ganho', () => {
    const r = iniciar(padrao);
    expect(rotulos(moverParaDireita(r, 'ATENDIMENTO'))).toEqual([
      'NOVO', 'AGENDADO', 'ATENDIMENTO', 'GANHO', 'PERDIDO',
    ]);
    expect(rotulos(moverParaEsquerda(r, 'AGENDADO'))).toEqual([
      'NOVO', 'AGENDADO', 'ATENDIMENTO', 'GANHO', 'PERDIDO',
    ]);
    expect(moverParaEsquerda(r, 'ATENDIMENTO')).toEqual(r);
    expect(moverParaDireita(r, 'AGENDADO')).toEqual(r);

    const foi = moverParaDireita(r, 'ATENDIMENTO');
    expect(moverParaDireita(foi, 'ATENDIMENTO')).toEqual(foi);
    expect(rotulos(moverParaEsquerda(foi, 'ATENDIMENTO'))).toEqual(idsDoPadrao);

    for (const id of ['NOVO', 'GANHO', 'PERDIDO']) {
      expect(moverParaEsquerda(r, id)).toEqual(r);
      expect(moverParaDireita(r, id)).toEqual(r);
    }

    const comNova = adicionar(r);
    const chave = etapaNova(comNova).chave;
    expect(moverParaDireita(comNova, chave)).toEqual(comNova);
    expect(rotulos(moverParaEsquerda(comNova, chave))).toEqual([
      'NOVO', 'ATENDIMENTO', 'Nova etapa', 'AGENDADO', 'GANHO', 'PERDIDO',
    ]);
  });

  it('paraPedido devolve {id?, nome} na ordem, sem id nas novas', () => {
    const base = adicionar(iniciar(padrao));
    const r = renomear(base, etapaNova(base).chave, 'Proposta enviada');
    expect(paraPedido(r)).toEqual([
      { id: 'NOVO', nome: 'Novos Leads', acao: 'nenhuma' },
      { id: 'ATENDIMENTO', nome: 'Em Atendimento', acao: 'nenhuma' },
      { id: 'AGENDADO', nome: 'Agendados', acao: 'consulta', exigencia: 'opcional' },
      { nome: 'Proposta enviada', acao: 'nenhuma' },
      { id: 'GANHO', nome: 'Ganho (Conversão)', acao: 'venda', exigencia: 'obrigatoria' },
      { id: 'PERDIDO', nome: 'Perdido', acao: 'nenhuma' },
    ]);
    expect(paraPedido(iniciar(padrao))).toEqual([
      { id: 'NOVO', nome: 'Novos Leads', acao: 'nenhuma' },
      { id: 'ATENDIMENTO', nome: 'Em Atendimento', acao: 'nenhuma' },
      { id: 'AGENDADO', nome: 'Agendados', acao: 'consulta', exigencia: 'opcional' },
      { id: 'GANHO', nome: 'Ganho (Conversão)', acao: 'venda', exigencia: 'obrigatoria' },
      { id: 'PERDIDO', nome: 'Perdido', acao: 'nenhuma' },
    ]);
  });

  it('definirAcao grava a ação e nenhuma apaga a exigência', () => {
    const r = definirAcao(definirAcao(iniciar(padrao), 'AGENDADO', 'ligar', 'obrigatoria'), 'AGENDADO', 'nenhuma');
    expect(r.etapas.find((e) => e.id === 'AGENDADO')).toMatchObject({ acao: 'nenhuma' });
    expect(r.etapas.find((e) => e.id === 'AGENDADO')?.exigencia).toBeUndefined();
    expect(paraPedido(definirAcao(iniciar(padrao), 'ATENDIMENTO', 'tarefa', 'opcional'))[1]).toEqual({
      id: 'ATENDIMENTO', nome: 'Em Atendimento', acao: 'tarefa', exigencia: 'opcional',
    });
  });

  it('as operações não alteram o rascunho recebido', () => {
    const r = iniciar(padrao);
    const antes = JSON.stringify(r);
    adicionar(r);
    renomear(r, 'NOVO', 'Entrada');
    remover(r, 'ATENDIMENTO');
    mover(r, 1, 2);
    moverParaEsquerda(r, 'AGENDADO');
    moverParaDireita(r, 'ATENDIMENTO');
    paraPedido(r);
    expect(JSON.stringify(r)).toBe(antes);
  });
});
