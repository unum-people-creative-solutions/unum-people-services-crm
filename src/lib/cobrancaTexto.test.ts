import { describe, it, expect, afterEach } from 'vitest';
import { diaAnterior, ferramentasCitadas, formatarData, formatarReais } from './cobrancaTexto';
import { resumoBloqueado, resumoEmAtraso } from '@/services/__fixtures__/cobranca';

// spec cobranca-e-plano-do-cliente RF2-21, RF2-22, RF2-23 e DV-19 (T40).

describe('formatarData (RF2-21)', () => {
  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  it('"2026-11-05" vira "05/11" com TZ=America/Sao_Paulo e com TZ=UTC', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(formatarData('2026-11-05')).toBe('05/11');
    expect(formatarData(resumoEmAtraso.pagar_ate!)).toBe('14/11');
    process.env.TZ = 'UTC';
    expect(formatarData('2026-11-05')).toBe('05/11');
    expect(formatarData(resumoEmAtraso.pagar_ate!)).toBe('14/11');
  });

  it('as cinco datas do contrato §4.1', () => {
    expect(formatarData(resumoEmAtraso.vencida_em!)).toBe('05/11');
    expect(formatarData(resumoEmAtraso.bloqueio_em!)).toBe('15/11');
    expect(formatarData(resumoEmAtraso.fora_do_ar_em!)).toBe('05/12');
    expect(formatarData(resumoEmAtraso.cancelamento_em!)).toBe('04/01');
  });
});

describe('diaAnterior (DV-19: "continua no ar até" = fora_do_ar_em − 1 dia)', () => {
  const tzOriginal = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tzOriginal;
  });

  it('fora_do_ar_em 2026-12-05 → 2026-12-04, em qualquer fuso', () => {
    process.env.TZ = 'America/Sao_Paulo';
    expect(diaAnterior(resumoBloqueado.fora_do_ar_em!)).toBe('2026-12-04');
    process.env.TZ = 'UTC';
    expect(diaAnterior(resumoBloqueado.fora_do_ar_em!)).toBe('2026-12-04');
  });

  it('vira o mês e o ano', () => {
    expect(diaAnterior('2026-12-01')).toBe('2026-11-30');
    expect(diaAnterior('2027-01-01')).toBe('2026-12-31');
    expect(diaAnterior('2026-03-01')).toBe('2026-02-28');
    expect(diaAnterior('2028-03-01')).toBe('2028-02-29');
  });
});

describe('formatarReais (RF2-22)', () => {
  it('39.9 → "R$ 39,90"; 1198.8 → "R$ 1.198,80"', () => {
    expect(formatarReais(39.9)).toBe('R$ 39,90');
    expect(formatarReais(1198.8)).toBe('R$ 1.198,80');
  });

  it('valor da fatura do contrato §4.1', () => {
    expect(formatarReais(resumoEmAtraso.fatura!.valor)).toBe('R$ 39,90');
  });
});

describe('ferramentasCitadas (RF2-23, BP-T D-3)', () => {
  it('as quatro combinações', () => {
    expect(ferramentasCitadas(['lp'])).toBe('Páginas');
    expect(ferramentasCitadas(['crm', 'lp'])).toBe('Páginas e CRM');
    expect(ferramentasCitadas(['blog', 'lp'])).toBe('Páginas e blog');
    expect(ferramentasCitadas(['crm', 'blog', 'lp'])).toBe('Páginas, CRM e blog');
  });

  it('fonte em bloqueado: ferramentas_bloqueadas do resumo', () => {
    expect(ferramentasCitadas(resumoBloqueado.ferramentas_bloqueadas)).toBe('Páginas, CRM e blog');
  });

  it('enabled_services de /me/tenants (nome "site" no plano) dá o mesmo texto', () => {
    expect(ferramentasCitadas(['site', 'crm', 'blog'])).toBe('Páginas, CRM e blog');
    expect(ferramentasCitadas(['site'])).toBe('Páginas');
  });
});
