import { paraUTC, partesEmBrasilia } from '@/lib/agendamento';
import { MENSAGEM_SEM_PERMISSAO } from '@/services/api';

// Adiar o lead (spec crm-funil-e-atividades-f4). O horário é o de Brasília
// (-03:00), o mesmo de paraUTC. Sem hora escolhida, 09:00.

export type AtalhoDeAdiar = 'amanha' | 'semana' | 'mes';

type ComRetomar = { id: string; tipo: string; situacao: string; vence_em: string };

function dataISO(ano: number, mesIndex: number, dia: number): string {
  const instante = new Date(Date.UTC(ano, mesIndex, dia));
  const mes = String(instante.getUTCMonth() + 1).padStart(2, '0');
  const diaFmt = String(instante.getUTCDate()).padStart(2, '0');
  return `${instante.getUTCFullYear()}-${mes}-${diaFmt}`;
}

function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  return dataISO(ano, mes - 1, dia + dias);
}

// Um mês civil. Dia que não existe no mês de destino (31 de janeiro) cai no último dia.
function somarMes(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return dataISO(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(dia, ultimo));
}

function hojeEmBrasilia(agora: Date): string {
  return partesEmBrasilia(agora.toISOString()).data;
}

export function venceEmDoAtalho(atalho: AtalhoDeAdiar, agora: Date): string {
  const hoje = hojeEmBrasilia(agora);
  const data = atalho === 'amanha' ? somarDias(hoje, 1) : atalho === 'semana' ? somarDias(hoje, 7) : somarMes(hoje, 1);
  return paraUTC(data, '09:00');
}

// Hora vazia ou ausente grava 09:00. Hora escolhida (HH:mm) entra como está.
export function venceEmDaData(data: string, hora: string | undefined): string {
  const escolhida = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : '09:00';
  return paraUTC(data, escolhida);
}

// A retomar pendente que ainda não venceu. Na hora exata o lead volta ao quadro.
export function retomarPendenteNoFuturo<T extends ComRetomar>(itens: readonly T[] | undefined, agora: Date): T | null {
  const limite = agora.getTime();
  let escolhida: T | null = null;
  let melhor = Infinity;
  for (const item of itens ?? []) {
    if (item.tipo !== 'retomar' || item.situacao !== 'pendente') continue;
    const ms = Date.parse(item.vence_em);
    if (Number.isNaN(ms) || ms <= limite || ms >= melhor) continue;
    escolhida = item;
    melhor = ms;
  }
  return escolhida;
}

export function mensagemDoAdiar(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { error?: string; motivo?: string; permissao?: unknown } } } | null)?.response;
  const data = response?.data;
  if (response?.status === 403 && typeof data?.permissao === 'string' && data.permissao.length > 0) {
    return MENSAGEM_SEM_PERMISSAO;
  }
  if (data?.error === 'adiar_invalido') {
    return typeof data.motivo === 'string' && data.motivo.length > 0
      ? `Não foi possível adiar: ${data.motivo}.`
      : 'Não foi possível adiar.';
  }
  if (data?.error === 'adiar_indisponivel') return 'Não é possível adiar este lead.';
  if (data?.error === 'recurso_desligado') return 'Recurso desligado.';
  return 'Não foi possível adiar. Tente de novo.';
}
