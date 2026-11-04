import { describe, it, expect, afterEach } from 'vitest';
import {
  paraUTC,
  partesEmBrasilia,
  formatarAgendamento,
  validarAgendamento,
  semLembretePush,
  referenciaDeInatividade,
  corDeInatividade,
  ordenarAgendados,
  mensagemDeLembrete,
  linkDeLembrete,
} from './agendamento';

// spec crm-agendamento-e-lembretes, CA-50 e CA-30. O vitest roda com
// TZ=America/Sao_Paulo; as funções não podem depender do fuso do processo.
const agora = new Date('2026-11-10T15:00:00Z'); // 12:00 em Brasília

describe('o processo de teste roda no fuso de Brasília', () => {
  it('TZ=America/Sao_Paulo (as conversões abaixo não podem depender disso)', () => {
    expect(new Date('2026-11-10T15:00:00Z').getHours()).toBe(12);
  });
});

describe('paraUTC (Brasília → UTC)', () => {
  it("'2026-11-05','15:30' → '2026-11-05T18:30:00Z'", () => {
    expect(paraUTC('2026-11-05', '15:30')).toBe('2026-11-05T18:30:00Z');
  });
  it("'2026-11-05','22:30' → '2026-11-06T01:30:00Z' (vira o dia em UTC)", () => {
    expect(paraUTC('2026-11-05', '22:30')).toBe('2026-11-06T01:30:00Z');
  });
});

describe('partesEmBrasilia (UTC → Brasília)', () => {
  it("'2026-11-06T01:30:00Z' → {data:'2026-11-05', hora:'22:30'}", () => {
    expect(partesEmBrasilia('2026-11-06T01:30:00Z')).toEqual({ data: '2026-11-05', hora: '22:30' });
  });
  it('ida e volta com paraUTC', () => {
    const { data, hora } = partesEmBrasilia('2026-11-12T18:30:00Z');
    expect(paraUTC(data, hora)).toBe('2026-11-12T18:30:00Z');
  });
  it('meia-noite em Brasília sai como 00:00, não 24:00', () => {
    expect(partesEmBrasilia('2026-11-06T03:00:00Z')).toEqual({ data: '2026-11-06', hora: '00:00' });
  });
});

describe('formatarAgendamento', () => {
  it("'2026-11-05T18:30:00Z' → 'qui 05/11 às 15:30'", () => {
    expect(formatarAgendamento('2026-11-05T18:30:00Z')).toBe('qui 05/11 às 15:30');
  });
  it("'2026-11-08T13:05:00Z' → 'dom 08/11 às 10:05'", () => {
    expect(formatarAgendamento('2026-11-08T13:05:00Z')).toBe('dom 08/11 às 10:05');
  });
  it('o dia da semana é o de Brasília, não o de UTC', () => {
    // 2026-11-06T01:30Z é sexta em UTC e quinta 22:30 em Brasília.
    expect(formatarAgendamento('2026-11-06T01:30:00Z')).toBe('qui 05/11 às 22:30');
  });
  it('sábado sai com acento', () => {
    expect(formatarAgendamento('2026-11-07T12:00:00Z')).toBe('sáb 07/11 às 09:00');
  });
});

describe('validarAgendamento', () => {
  it("12:00 em Brasília (= agora) → 'Escolha um horário a partir de agora.'", () => {
    expect(validarAgendamento(paraUTC('2026-11-10', '12:00'), agora)).toBe('Escolha um horário a partir de agora.');
  });
  it('12:01 → null', () => {
    expect(validarAgendamento(paraUTC('2026-11-10', '12:01'), agora)).toBeNull();
  });
  it('2027-11-10 12:00 (agora + 365 dias) → null', () => {
    expect(validarAgendamento(paraUTC('2027-11-10', '12:00'), agora)).toBeNull();
  });
  it("2027-11-10 12:01 → 'Escolha uma data nos próximos 12 meses.'", () => {
    expect(validarAgendamento(paraUTC('2027-11-10', '12:01'), agora)).toBe('Escolha uma data nos próximos 12 meses.');
  });
  it('segundos são truncados ao minuto antes de comparar (como FormatarInstante da API)', () => {
    expect(validarAgendamento('2026-11-10T15:00:45Z', agora)).toBe('Escolha um horário a partir de agora.');
  });
});

describe('semLembretePush (faltam menos de 60 min)', () => {
  it("'2026-11-10T15:59:00Z' → true", () => {
    expect(semLembretePush('2026-11-10T15:59:00Z', agora)).toBe(true);
  });
  it("'2026-11-10T16:00:00Z' → false", () => {
    expect(semLembretePush('2026-11-10T16:00:00Z', agora)).toBe(false);
  });
});

describe('mensagemDeLembrete', () => {
  it('literal do blueprint §4', () => {
    expect(
      mensagemDeLembrete({ nome: 'Maria Silva', negocio: 'Consultório Ana Lima', iso: '2026-11-05T18:30:00Z' }),
    ).toBe(
      'Olá, Maria! Lembrando do seu horário com Consultório Ana Lima: quinta-feira, 05/11, às 15:30. Se precisar remarcar, é só responder esta mensagem.',
    );
  });
  it("nome vazio → começa com 'Olá! Lembrando'", () => {
    const m = mensagemDeLembrete({ nome: '', negocio: 'Consultório Ana Lima', iso: '2026-11-05T18:30:00Z' });
    expect(m.startsWith('Olá! Lembrando')).toBe(true);
  });
  it('nome só com espaços conta como vazio; primeiro nome sem espaços nas pontas', () => {
    expect(mensagemDeLembrete({ nome: '   ', negocio: '', iso: '2026-11-05T18:30:00Z' }).startsWith('Olá! Lembrando')).toBe(true);
    expect(mensagemDeLembrete({ nome: '  Ana  Lima ', negocio: '', iso: '2026-11-05T18:30:00Z' }).startsWith('Olá, Ana! Lembrando')).toBe(true);
  });
  it("negócio vazio → 'Lembrando do seu horário: quinta-feira, 05/11, às 15:30.'", () => {
    const m = mensagemDeLembrete({ nome: 'Maria Silva', negocio: '', iso: '2026-11-05T18:30:00Z' });
    expect(m).toContain('Lembrando do seu horário: quinta-feira, 05/11, às 15:30.');
    expect(m).toBe('Olá, Maria! Lembrando do seu horário: quinta-feira, 05/11, às 15:30. Se precisar remarcar, é só responder esta mensagem.');
  });
  it('dia longo de domingo e de sábado', () => {
    expect(mensagemDeLembrete({ nome: '', negocio: '', iso: '2026-11-08T13:05:00Z' })).toContain(': domingo, 08/11, às 10:05.');
    expect(mensagemDeLembrete({ nome: '', negocio: '', iso: '2026-11-07T12:00:00Z' })).toContain(': sábado, 07/11, às 09:00.');
  });
});

describe('linkDeLembrete', () => {
  it("'(81) 99999-0000' → 55 na frente", () => {
    expect(linkDeLembrete('(81) 99999-0000', 'Oi')).toBe('https://wa.me/5581999990000?text=Oi');
  });
  it("'5581999990000' → como está", () => {
    expect(linkDeLembrete('5581999990000', 'Oi')).toBe('https://wa.me/5581999990000?text=Oi');
  });
  it("'8199990000' (10 dígitos) → 55 na frente", () => {
    expect(linkDeLembrete('8199990000', 'Oi')).toBe('https://wa.me/558199990000?text=Oi');
  });
  it("'99990000' → null; '' → null", () => {
    expect(linkDeLembrete('99990000', 'Oi')).toBeNull();
    expect(linkDeLembrete('', 'Oi')).toBeNull();
  });
  it('codifica a mensagem com encodeURIComponent (& → %26, # → %23)', () => {
    expect(linkDeLembrete('5581999990000', 'A & B #1')).toBe('https://wa.me/5581999990000?text=A%20%26%20B%20%231');
  });
});

describe('ordenarAgendados', () => {
  it("ids ['c','d','a','b']: crescente por agendado_em, sem data no fim", () => {
    const leads = [
      { id: 'a', agendado_em: '2026-11-12T12:00:00Z' },
      { id: 'b' },
      { id: 'c', agendado_em: '2026-11-09T12:00:00Z' },
      { id: 'd', agendado_em: '2026-11-11T12:00:00Z' },
    ];
    expect(ordenarAgendados(leads).map((l) => l.id)).toEqual(['c', 'd', 'a', 'b']);
  });
  it('os sem data ficam na ordem em que a API devolveu, e o array original não muda', () => {
    const leads = [{ id: 'x' }, { id: 'y', agendado_em: '2026-11-12T12:00:00Z' }, { id: 'z' }];
    expect(ordenarAgendados(leads).map((l) => l.id)).toEqual(['y', 'x', 'z']);
    expect(leads.map((l) => l.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('CA-30 — regra única de inatividade (mesma tabela do Go)', () => {
  type Caso = {
    n: number;
    status: string;
    updated_at?: string;
    created_at?: string;
    agendado_em?: string;
    parado: boolean;
    cor: 'azul' | 'laranja' | 'vermelho';
  };
  const casos: Caso[] = [
    { n: 1, status: 'NOVO', updated_at: '2026-11-09T15:00:01Z', parado: false, cor: 'azul' },
    { n: 2, status: 'NOVO', updated_at: '2026-11-09T15:00:00Z', parado: true, cor: 'laranja' },
    { n: 3, status: 'ATENDIMENTO', updated_at: '2026-11-08T15:00:00Z', parado: true, cor: 'vermelho' },
    { n: 4, status: 'ATENDIMENTO', created_at: '2026-11-09T14:00:00Z', parado: true, cor: 'laranja' },
    { n: 5, status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-11T12:00:00Z', parado: false, cor: 'azul' },
    { n: 6, status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-10T10:00:00Z', parado: false, cor: 'azul' },
    { n: 7, status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-09T14:00:00Z', parado: true, cor: 'laranja' },
    { n: 8, status: 'AGENDADO', updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-08T14:00:00Z', parado: true, cor: 'vermelho' },
    { n: 9, status: 'AGENDADO', updated_at: '2026-11-08T15:00:00Z', parado: true, cor: 'vermelho' },
    { n: 10, status: 'AGENDADO', updated_at: '2026-11-10T12:00:00Z', agendado_em: '2026-11-09T10:00:00Z', parado: false, cor: 'azul' },
    { n: 11, status: 'GANHO', updated_at: '2026-01-01T00:00:00Z', parado: false, cor: 'azul' },
    { n: 12, status: 'PERDIDO', updated_at: '2026-01-01T00:00:00Z', parado: false, cor: 'azul' },
    { n: 13, status: 'ATENDIMENTO', updated_at: '2026-11-08T15:00:00Z', agendado_em: '2026-11-20T12:00:00Z', parado: true, cor: 'vermelho' },
  ];

  it.each(casos)('#$n $status → cor $cor', (caso) => {
    const { n: _n, parado: _p, cor, status, ...campos } = caso;
    const lead = { status, ...campos };
    expect(corDeInatividade(lead, status, agora)).toBe(cor);
    // Parado ⇔ cor diferente de azul (mesma fronteira de 24h do LeadParado em Go).
    expect(corDeInatividade(lead, status, agora) !== 'azul').toBe(caso.parado);
  });

  it('parados: #2, #3, #4, #7, #8, #9, #13 = 7', () => {
    const parados = casos.filter((c) => {
      const { n: _n, parado: _p, cor: _c, status, ...campos } = c;
      const lead = { status, ...campos };
      return corDeInatividade(lead, status, agora) !== 'azul';
    });
    expect(parados.map((c) => c.n)).toEqual([2, 3, 4, 7, 8, 9, 13]);
  });

  it('referência: em AGENDADO é o maior entre updated_at e agendado_em', () => {
    expect(
      referenciaDeInatividade({ updated_at: '2026-11-01T00:00:00Z', agendado_em: '2026-11-11T12:00:00Z' }, 'AGENDADO')?.toISOString(),
    ).toBe('2026-11-11T12:00:00.000Z');
    expect(
      referenciaDeInatividade({ updated_at: '2026-11-10T12:00:00Z', agendado_em: '2026-11-09T10:00:00Z' }, 'AGENDADO')?.toISOString(),
    ).toBe('2026-11-10T12:00:00.000Z');
  });

  it('referência: fora de AGENDADO ignora agendado_em', () => {
    expect(
      referenciaDeInatividade({ updated_at: '2026-11-08T15:00:00Z', agendado_em: '2026-11-20T12:00:00Z' }, 'ATENDIMENTO')?.toISOString(),
    ).toBe('2026-11-08T15:00:00.000Z');
  });

  it('referência: sem updated_at usa created_at; o instante zero do Go (0001-01-01) conta como ausente', () => {
    expect(referenciaDeInatividade({ created_at: '2026-11-09T14:00:00Z' }, 'NOVO')?.toISOString()).toBe('2026-11-09T14:00:00.000Z');
    expect(
      referenciaDeInatividade({ updated_at: '0001-01-01T00:00:00Z', created_at: '2026-11-09T14:00:00Z' }, 'NOVO')?.toISOString(),
    ).toBe('2026-11-09T14:00:00.000Z');
  });

  it('referência: sem nenhuma data → null, e a cor fica azul', () => {
    expect(referenciaDeInatividade({}, 'NOVO')).toBeNull();
    expect(corDeInatividade({}, 'NOVO', agora)).toBe('azul');
  });
});

// Lacuna 2 do validation.md (mutação E13): o fuso do processo não pode mudar a
// conversão. O Node relê process.env.TZ a cada atribuição, então trocar o TZ
// aqui muda o fuso local de Date (getHours, parse sem deslocamento).
describe('as conversões independem do fuso do processo', () => {
  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  // 2026-11-10T15:00:00Z: 00:00 do dia 11 em Tóquio (UTC+9), 10:00 em Nova York (UTC-5).
  it.each([
    ['Asia/Tokyo', 0],
    ['America/New_York', 10],
  ])('%s', (fuso, horaLocalEsperada) => {
    process.env.TZ = fuso;
    // Sentinela: a troca de fuso valeu para Date neste processo.
    expect(new Date('2026-11-10T15:00:00Z').getHours()).toBe(horaLocalEsperada);

    // Digitado em Brasília → agendado_em em UTC.
    expect(paraUTC('2026-11-05', '15:30')).toBe('2026-11-05T18:30:00Z');
    expect(paraUTC('2026-11-05', '22:30')).toBe('2026-11-06T01:30:00Z');

    // agendado_em → texto em Brasília (modal, cartão e WhatsApp).
    expect(partesEmBrasilia('2026-11-06T01:30:00Z')).toEqual({ data: '2026-11-05', hora: '22:30' });
    expect(formatarAgendamento('2026-11-06T01:30:00Z')).toBe('qui 05/11 às 22:30');
    expect(
      mensagemDeLembrete({ nome: 'Maria Silva', negocio: 'Consultório Ana Lima', iso: '2026-11-05T18:30:00Z' }),
    ).toBe(
      'Olá, Maria! Lembrando do seu horário com Consultório Ana Lima: quinta-feira, 05/11, às 15:30. Se precisar remarcar, é só responder esta mensagem.',
    );

    // Ida e volta pelo modal.
    const { data, hora } = partesEmBrasilia('2026-11-12T18:30:00Z');
    expect(paraUTC(data, hora)).toBe('2026-11-12T18:30:00Z');
  });

  it('o fuso volta ao de Brasília depois de cada caso', () => {
    expect(new Date('2026-11-10T15:00:00Z').getHours()).toBe(12);
  });
});
