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
