// Formatadores dos textos de cobrança (spec cobranca-e-plano-do-cliente RF2-21–RF2-23).
// As datas da API chegam em AAAA-MM-DD (Brasília) e são tratadas só como texto:
// nada de `new Date()`, que converte o fuso e volta um dia.

// "2026-11-05" → "05/11".
export function formatarData(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    return bissexto ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

// "2026-12-05" → "2026-12-04" (DV-19: "continua no ar até" = fora_do_ar_em − 1 dia).
export function diaAnterior(data: string): string {
  let [ano, mes, dia] = data.split('-').map(Number);
  dia -= 1;
  if (dia === 0) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    dia = diasNoMes(ano, mes);
  }
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

// 39.9 → "R$ 39,90"; 1198.8 → "R$ 1.198,80".
export function formatarReais(valor: number): string {
  const [inteiro, centavos] = valor.toFixed(2).split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${comMilhar},${centavos}`;
}

// "Páginas" + "CRM" se há crm + "blog" se há blog (BP-T D-3).
export function ferramentasCitadas(servicos: readonly string[]): string {
  const nomes = ['Páginas'];
  if (servicos.includes('crm')) nomes.push('CRM');
  if (servicos.includes('blog')) nomes.push('blog');
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
