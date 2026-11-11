// Espelho exato do contrato GET /me/cobranca (TECH-DESIGN cobranca-e-plano-do-cliente
// §4.1; spec RF2-20). `reativacao` só entra na fase 4.

export type SituacaoDaCobranca =
  | 'em_dia'
  | 'em_atraso'
  | 'bloqueado'
  | 'fora_do_ar'
  | 'pausada'
  | 'cancelada'
  | 'outra';

export type FerramentaBloqueada = 'crm' | 'blog' | 'lp';

export interface FaturaDoResumo {
  valor: number;
  vencimento: string; // AAAA-MM-DD, horário de Brasília
  link?: string; // ausente quando pode_gerir é false
}

export interface ResumoDeCobranca {
  situacao: SituacaoDaCobranca;
  fatura: FaturaDoResumo | null;
  // As cinco datas (AAAA-MM-DD): presentes só quando há atraso por cobrança.
  vencida_em?: string;
  pagar_ate?: string;
  bloqueio_em?: string;
  fora_do_ar_em?: string;
  cancelamento_em?: string;
  ferramentas_bloqueadas: FerramentaBloqueada[]; // nunca null
  pode_gerir: boolean;
}
