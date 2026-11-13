import { partesEmBrasilia } from '@/lib/agendamento';

// Atividades do quadro (spec crm-funil-e-atividades-f3, ATV-06 e decisões de 12/11/2026).
// O horário é o de Brasília (-03:00), o mesmo de paraUTC / partesEmBrasilia.

export const TIPOS_DE_ATIVIDADE = [
  { valor: 'consulta', rotulo: 'Consulta' },
  { valor: 'ligar', rotulo: 'Ligar' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'reuniao', rotulo: 'Reunião' },
  { valor: 'tarefa', rotulo: 'Tarefa' },
  { valor: 'retomar', rotulo: 'Retomar contato' },
] as const;

export type TipoDeAtividade = (typeof TIPOS_DE_ATIVIDADE)[number]['valor'];

const ROTULOS: Record<string, string> = Object.fromEntries(
  TIPOS_DE_ATIVIDADE.map((tipo) => [tipo.valor, tipo.rotulo]),
);

export function rotuloDaAtividade(tipo: string): string {
  return ROTULOS[tipo] ?? tipo;
}

// sem lembrete = campo ausente. Os valores são os minutos que o POST manda.
export const LEMBRETES_DE_ATIVIDADE = [
  { valor: '', rotulo: 'Sem lembrete' },
  { valor: '0', rotulo: 'Na hora' },
  { valor: '15', rotulo: '15 min' },
  { valor: '60', rotulo: '1 hora' },
  { valor: '1440', rotulo: '1 dia' },
] as const;

export function rotuloDoLembrete(minutos: number | undefined): string | null {
  if (minutos === undefined) return null;
  const achado = LEMBRETES_DE_ATIVIDADE.find((opcao) => opcao.valor !== '' && Number(opcao.valor) === minutos);
  return achado ? achado.rotulo : null;
}

export function textoDoLembrete(minutos: number | undefined): string | null {
  const rotulo = rotuloDoLembrete(minutos);
  if (!rotulo) return null;
  if (minutos === 0) return 'Lembrete — na hora';
  return `Lembrete — ${rotulo} antes`;
}

export function textoDaDuracao(minutos: number | undefined): string | null {
  if (minutos === undefined || minutos <= 0) return null;
  return `Duração — ${minutos} min`;
}

export const ROTULO_DA_SITUACAO: Record<string, string> = {
  pendente: 'Pendente',
  feita: 'Feita',
  cancelada: 'Cancelada',
};

export function textoDaSituacao(situacao: string): string {
  return `Status — ${ROTULO_DA_SITUACAO[situacao] ?? situacao}`;
}

type ComVencimento = { situacao: string; vence_em: string };

function instante(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

// A próxima é a pendente de vence_em mais cedo. Feita e cancelada não entram.
export function proximaPendente<T extends ComVencimento>(itens: readonly T[] | undefined): T | null {
  let escolhida: T | null = null;
  let melhor = Infinity;
  for (const item of itens ?? []) {
    if (item.situacao !== 'pendente') continue;
    const ms = instante(item.vence_em);
    if (ms === null || ms >= melhor) continue;
    escolhida = item;
    melhor = ms;
  }
  return escolhida;
}

export function ordenarPorVencimento<T extends ComVencimento & { id: string }>(itens: readonly T[]): T[] {
  return itens.toSorted((a, b) => {
    const am = instante(a.vence_em);
    const bm = instante(b.vence_em);
    if (am === null && bm === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (am === null) return 1;
    if (bm === null) return -1;
    if (am !== bm) return am - bm;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

function diaEmBrasilia(iso: string): string | null {
  if (instante(iso) === null) return null;
  return partesEmBrasilia(iso).data;
}

// Pendente que vence no dia de calendário de Brasília de `agora`.
export function temPendenteHoje(itens: readonly ComVencimento[] | undefined, agora: Date): boolean {
  const dia = diaEmBrasilia(agora.toISOString());
  if (!dia) return false;
  return (itens ?? []).some((item) => item.situacao === 'pendente' && diaEmBrasilia(item.vence_em) === dia);
}

// Pendente com vence_em depois de agora: o lead não conta como parado.
export function temPendenteNoFuturo(itens: readonly ComVencimento[] | undefined, agora: Date): boolean {
  const ms = agora.getTime();
  return (itens ?? []).some((item) => item.situacao === 'pendente' && (instante(item.vence_em) ?? 0) > ms);
}
