// Origens do lead (spec crm-origens-personalizadas, TECH-DESIGN D4). A API valida e é a fonte da
// verdade; estas regras espelham as dela só para avisar antes de enviar.

// Lista de uma conta que nunca salvou a sua. Só serve de reserva quando a leitura falha (RF-OR-10).
export const ORIGENS_PADRAO: string[] = ['Indicação', 'WhatsApp', 'Instagram', 'Facebook', 'Outro'];

export const MAX_ORIGENS = 20;
export const MAX_NOME_DA_ORIGEM = 30;

export type MotivoDeOrigem = 'vazia' | 'nome_vazio' | 'nome_longo' | 'duplicada' | 'limite' | 'caractere';

export const MENSAGEM_DO_MOTIVO: Record<MotivoDeOrigem, string> = {
  vazia: 'Mantenha ao menos uma origem.',
  nome_vazio: 'Digite o nome da origem.',
  nome_longo: `O nome pode ter no máximo ${MAX_NOME_DA_ORIGEM} caracteres.`,
  duplicada: 'Essa origem já existe.',
  limite: `A lista pode ter no máximo ${MAX_ORIGENS} origens.`,
  caractere: 'O nome tem caractere inválido.',
};

export function motivoConhecido(motivo: unknown): motivo is MotivoDeOrigem {
  return typeof motivo === 'string' && Object.prototype.hasOwnProperty.call(MENSAGEM_DO_MOTIVO, motivo);
}

// eslint-disable-next-line no-control-regex
const CARACTERE_DE_CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

// Compara sem maiúscula e sem acento: "Indicacao" e "indicação" são a mesma origem.
export function chaveDaOrigem(nome: string): string {
  return nome.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function validarNovaOrigem(
  nome: string,
  existentes: string[],
): { ok: true; nome: string } | { ok: false; motivo: MotivoDeOrigem } {
  const limpo = nome.trim();
  if (limpo === '') return { ok: false, motivo: 'nome_vazio' };
  if (CARACTERE_DE_CONTROLE.test(limpo)) return { ok: false, motivo: 'caractere' };
  if (Array.from(limpo).length > MAX_NOME_DA_ORIGEM) return { ok: false, motivo: 'nome_longo' };
  const chave = chaveDaOrigem(limpo);
  if (existentes.some((e) => chaveDaOrigem(e) === chave)) return { ok: false, motivo: 'duplicada' };
  if (existentes.length >= MAX_ORIGENS) return { ok: false, motivo: 'limite' };
  return { ok: true, nome: limpo };
}

export function validarLista(itens: string[]): MotivoDeOrigem | null {
  if (itens.length === 0) return 'vazia';
  if (itens.length > MAX_ORIGENS) return 'limite';
  return null;
}
