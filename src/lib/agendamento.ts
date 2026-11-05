// Agendamento no quadro do CRM (spec crm-agendamento-e-lembretes, RF-50;
// TECH-DESIGN §5.7; blueprint §3 e §4). Funções puras, sem React.
//
// Fuso (O4, D-AG-13): o horário é guardado em UTC e digitado/mostrado em
// Brasília, independentemente do fuso do aparelho. A entrada usa o
// deslocamento fixo -03:00 (o Brasil não tem horário de verão desde 2019);
// a saída usa Intl.DateTimeFormat com timeZone explícito. Nada de getHours().

const FUSO = 'America/Sao_Paulo';
const DESLOCAMENTO = '-03:00';

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const ANTECEDENCIA_DO_LEMBRETE = HORA;
const LIMITE_DE_INATIVIDADE = 24 * HORA;
const LIMITE_CRITICO = 48 * HORA;
const PRAZO_MAXIMO = 365 * 24 * HORA;

const COLUNAS_COM_INATIVIDADE = ['NOVO', 'ATENDIMENTO', 'AGENDADO'];

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const partesFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type Partes = { ano: string; mes: string; dia: string; hora: string; minuto: string; diaDaSemana: number };

function partes(iso: string): Partes {
  const p: Record<string, string> = {};
  for (const { type, value } of partesFmt.formatToParts(new Date(iso))) p[type] = value;
  // Dia da semana do dia de calendário de Brasília (não do instante em UTC).
  const diaDaSemana = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, diaDaSemana };
}

// Instante truncado ao minuto, como domain.FormatarInstante da API.
const truncarAoMinuto = (ms: number) => Math.floor(ms / MINUTO) * MINUTO;

// "2026-11-05", "15:30" (Brasília) → "2026-11-05T18:30:00Z".
export function paraUTC(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00${DESLOCAMENTO}`).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// "2026-11-06T01:30:00Z" → { data: "2026-11-05", hora: "22:30" } (para preencher o modal).
export function partesEmBrasilia(iso: string): { data: string; hora: string } {
  const p = partes(iso);
  return { data: `${p.ano}-${p.mes}-${p.dia}`, hora: `${p.hora}:${p.minuto}` };
}

// "2026-11-05T18:30:00Z" → "qui 05/11 às 15:30".
export function formatarAgendamento(iso: string): string {
  const p = partes(iso);
  return `${DIAS_CURTOS[p.diaDaSemana]} ${p.dia}/${p.mes} às ${p.hora}:${p.minuto}`;
}

// Texto do erro de campo, ou null quando o horário vale (mesma regra de ValidarAgendamento da API).
export function validarAgendamento(iso: string, agora: Date): string | null {
  const ag = truncarAoMinuto(Date.parse(iso));
  if (ag <= agora.getTime()) return 'Escolha um horário a partir de agora.';
  if (ag > agora.getTime() + PRAZO_MAXIMO) return 'Escolha uma data nos próximos 12 meses.';
  return null;
}

// Faltam menos de 60 min: a API dispensa o lembrete por push (O3).
export function semLembretePush(iso: string, agora: Date): boolean {
  return Date.parse(iso) - agora.getTime() < ANTECEDENCIA_DO_LEMBRETE;
}

export interface LeadComDatas {
  updated_at?: string;
  created_at?: string;
  agendado_em?: string;
}

// Data válida, ou null. O instante zero do Go (0001-01-01T00:00:00Z, campo
// time.Time sem valor) conta como ausente, como IsZero() na API.
function instante(valor?: string): number | null {
  if (!valor || valor.startsWith('0001-01-01')) return null;
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? null : ms;
}

// D-AG-7: referência = updated_at (ou created_at); em "Agendados" com
// agendado_em, o maior entre os dois. Mesma regra de ReferenciaDeInatividade (Go).
export function referenciaDeInatividade(lead: LeadComDatas, coluna: string): Date | null {
  let ref = instante(lead.updated_at) ?? instante(lead.created_at);
  const agendado = coluna === 'AGENDADO' ? instante(lead.agendado_em) : null;
  if (agendado !== null && (ref === null || agendado > ref)) ref = agendado;
  return ref === null ? null : new Date(ref);
}

export type CorDeInatividade = 'azul' | 'laranja' | 'vermelho';

// Cor da faixa do cartão: >= 48h vermelho, >= 24h laranja, senão azul; só em
// NOVO, ATENDIMENTO e AGENDADO. Parado (LeadParado em Go) ⇔ cor diferente de azul.
export function corDeInatividade(lead: LeadComDatas, coluna: string, agora: Date): CorDeInatividade {
  if (!COLUNAS_COM_INATIVIDADE.includes(coluna)) return 'azul';
  const ref = referenciaDeInatividade(lead, coluna);
  if (!ref) return 'azul';
  const parado = agora.getTime() - ref.getTime();
  if (parado >= LIMITE_CRITICO) return 'vermelho';
  if (parado >= LIMITE_DE_INATIVIDADE) return 'laranja';
  return 'azul';
}

// "Agendados": agendado_em crescente; sem data no fim, na ordem recebida. Não muda o array.
export function ordenarAgendados<T extends { agendado_em?: string }>(leads: T[]): T[] {
  const comData = leads.filter((l) => instante(l.agendado_em) !== null);
  const semData = leads.filter((l) => instante(l.agendado_em) === null);
  comData.sort((a, b) => (instante(a.agendado_em) as number) - (instante(b.agendado_em) as number));
  return [...comData, ...semData];
}

// Blueprint §4: mensagem pronta para o contato, editável no WhatsApp.
export function mensagemDeLembrete(p: { nome: string; negocio: string; iso: string }): string {
  const primeiroNome = p.nome.trim().split(/\s+/)[0] ?? '';
  const negocio = p.negocio.trim();
  const d = partes(p.iso);
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const com = negocio ? ` com ${negocio}` : '';
  return `${saudacao} Lembrando do seu horário${com}: ${DIAS_LONGOS[d.diaDaSemana]}, ${d.dia}/${d.mes}, às ${d.hora}:${d.minuto}. Se precisar remarcar, é só responder esta mensagem.`;
}

// Telefone utilizável: 10 ou 11 dígitos ganham 55; 55 + 12 ou 13 dígitos fica como está; o resto, null.
export function linkDeLembrete(telefone: string, mensagem: string): string | null {
  const digitos = telefone.replace(/\D/g, '');
  let numero: string | null = null;
  if (digitos.length === 10 || digitos.length === 11) numero = `55${digitos}`;
  else if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) numero = digitos;
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
