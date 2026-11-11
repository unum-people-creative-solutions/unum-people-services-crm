import type { ResumoDeCobranca } from '@/types/cobranca';

// Fixtures do GET /me/cobranca (TECH-DESIGN cobranca-e-plano-do-cliente §4.1),
// tipadas pelo contrato. Conta de teste do tasks.md: atraso desde 2026-11-05,
// mensal R$ 39,90, EnabledServices ["site","crm","blog"] (lp, crm e blog no catálogo).

// Exemplo literal do §4.1.
export const resumoEmAtraso: ResumoDeCobranca = {
  situacao: 'em_atraso',
  fatura: { valor: 39.9, vencimento: '2026-11-05', link: 'https://www.asaas.com/i/abc' },
  vencida_em: '2026-11-05',
  pagar_ate: '2026-11-14',
  bloqueio_em: '2026-11-15',
  fora_do_ar_em: '2026-12-05',
  cancelamento_em: '2027-01-04',
  ferramentas_bloqueadas: [],
  pode_gerir: true,
};

// Conta em dia: o JSON exato do §4.1.
export const resumoEmDia: ResumoDeCobranca = {
  situacao: 'em_dia',
  fatura: null,
  ferramentas_bloqueadas: [],
  pode_gerir: true,
};

// Suspenso (D+10 a D+29): as três ferramentas do plano bloqueadas, na ordem do catálogo.
export const resumoBloqueado: ResumoDeCobranca = {
  ...resumoEmAtraso,
  situacao: 'bloqueado',
  ferramentas_bloqueadas: ['crm', 'blog', 'lp'],
};

// Suspenso visto por quem não gere o contrato: a API omite fatura.link.
export const resumoBloqueadoSemGerir: ResumoDeCobranca = {
  ...resumoBloqueado,
  fatura: { valor: 39.9, vencimento: '2026-11-05' },
  pode_gerir: false,
};

// Suspenso sem registro OVERDUE (a API registra cobranca.fatura.ausente).
export const resumoBloqueadoSemFatura: ResumoDeCobranca = {
  ...resumoBloqueado,
  fatura: null,
};

// Pausado por cobrança (D+30 a D+59): fatura sempre null.
export const resumoForaDoAr: ResumoDeCobranca = {
  ...resumoBloqueado,
  situacao: 'fora_do_ar',
  fatura: null,
};

// R6 (T11) com o único par que a fatura mensal produz (TECH-DESIGN, proposta A; Verifier F2 r2,
// N2): faturas de 31/01 e 28/02, as duas vencidas em 01/03 (D+29 de 31/01), conta Suspensa.
// `fatura` = OVERDUE mais antiga (RF2-08); `vencida_em` = DelinquencySince = o vencimento dela
// (RF1-20), com as demais datas contadas dele (D+9, D+10, D+30, D+60).
export const RELOGIO_DO_PARCIAL = new Date('2026-03-01T15:00:00Z').getTime();

export const resumoBloqueadoAntesDoParcial: ResumoDeCobranca = {
  ...resumoBloqueado,
  fatura: { valor: 39.9, vencimento: '2026-01-31', link: 'https://www.asaas.com/i/jan' },
  vencida_em: '2026-01-31',
  pagar_ate: '2026-02-09',
  bloqueio_em: '2026-02-10',
  fora_do_ar_em: '2026-03-02',
  cancelamento_em: '2026-04-01',
};

const datasDesde2802 = {
  vencida_em: '2026-02-28',
  pagar_ate: '2026-03-09',
  bloqueio_em: '2026-03-10',
  fora_do_ar_em: '2026-03-30',
  cancelamento_em: '2026-04-29',
};

// Pago o 31/01, o RF1-20 move DelinquencySince para 28/02 (dias = 1): a conta volta a
// INADIMPLENTE, `em_atraso` sem ferramentas bloqueadas. É o caminho real do R6.
export const resumoEmAtrasoDepoisDoParcial: ResumoDeCobranca = {
  ...resumoEmAtraso,
  fatura: { valor: 39.9, vencimento: '2026-02-28', link: 'https://www.asaas.com/i/fev' },
  ...datasDesde2802,
  ferramentas_bloqueadas: [],
};

// Desfecho "parcial" do RF2-33 no CRM: continua `bloqueado`, com outro `fatura.vencimento`.
// Com fatura mensal esse estado não chega: o RF1-20 recalcula o estado no próprio pagamento
// (dias desde 28/02 < 10 → INADIMPLENTE), e o CRM confirma (resumoEmAtrasoDepoisDoParcial).
// Fica só para o caminho que o RF2-33 escreve, sem afirmar que a API o produz hoje.
export const resumoBloqueadoComOutroVencimento: ResumoDeCobranca = {
  ...resumoEmAtrasoDepoisDoParcial,
  situacao: 'bloqueado',
  ferramentas_bloqueadas: ['crm', 'blog', 'lp'],
};
