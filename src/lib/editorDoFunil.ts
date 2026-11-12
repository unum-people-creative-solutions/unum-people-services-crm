import type { EtapaFunil, Funil } from '@/services/api';

// Rascunho do editor do funil (spec crm-funil-e-atividades-f1, FUN-12 a FUN-14).
// Funções puras, sem React. Quem decide na gravação é o servidor.

export const LIMITE_DE_ETAPAS = 10;

export type Rascunho = {
  versao: number;
  etapas: (EtapaFunil & { nova?: true; chave: string })[];
};

type EtapaDoRascunho = Rascunho['etapas'][number];

export function iniciar(funil: Funil): Rascunho {
  return {
    versao: funil.versao,
    etapas: funil.etapas.map((etapa) => ({ ...etapa, chave: etapa.id })),
  };
}

export function podeAdicionar(r: Rascunho): boolean {
  return r.etapas.length < LIMITE_DE_ETAPAS;
}

export function limitesDeMovimento(r: Rascunho): { min: number; max: number } {
  const ganho = r.etapas.findIndex((etapa) => etapa.papel === 'ganho');
  return { min: 1, max: ganho - 1 };
}

function nomeDaNova(nomes: string[]): string {
  if (!nomes.includes('Nova etapa')) return 'Nova etapa';
  let n = 2;
  while (nomes.includes(`Nova etapa ${n}`)) n += 1;
  return `Nova etapa ${n}`;
}

function chaveNova(chaves: string[]): string {
  let n = 1;
  while (chaves.includes(`nova-${n}`)) n += 1;
  return `nova-${n}`;
}

export function adicionar(r: Rascunho): Rascunho {
  if (!podeAdicionar(r)) return r;
  const indiceGanho = r.etapas.findIndex((etapa) => etapa.papel === 'ganho');
  if (indiceGanho < 0) return r;
  const nova: EtapaDoRascunho = {
    id: '',
    nome: nomeDaNova(r.etapas.map((etapa) => etapa.nome)),
    papel: 'comum',
    removivel: true,
    movivel: true,
    nova: true,
    chave: chaveNova(r.etapas.map((etapa) => etapa.chave)),
  };
  const etapas = r.etapas.slice();
  etapas.splice(indiceGanho, 0, nova);
  return { versao: r.versao, etapas };
}

export function renomear(r: Rascunho, chave: string, nome: string): Rascunho {
  const indice = r.etapas.findIndex((etapa) => etapa.chave === chave);
  if (indice < 0) return r;
  const etapas = r.etapas.slice();
  etapas[indice] = { ...etapas[indice], nome };
  return { versao: r.versao, etapas };
}

export function remover(r: Rascunho, chave: string): Rascunho {
  const etapa = r.etapas.find((item) => item.chave === chave);
  if (!etapa?.removivel) return r;
  return {
    versao: r.versao,
    etapas: r.etapas.filter((item) => item.chave !== chave),
  };
}

export function mover(r: Rascunho, de: number, para: number): Rascunho {
  const { min, max } = limitesDeMovimento(r);
  const etapa = r.etapas[de];
  if (!etapa?.movivel || de < min || de > max || para < min || para > max || para === de) return r;
  const etapas = r.etapas.slice();
  const [item] = etapas.splice(de, 1);
  if (!item) return r;
  etapas.splice(para, 0, item);
  return { versao: r.versao, etapas };
}

function trocar(r: Rascunho, a: number, b: number): Rascunho {
  const etapas = r.etapas.slice();
  const item = etapas[a];
  etapas[a] = etapas[b];
  etapas[b] = item;
  return { versao: r.versao, etapas };
}

export function moverParaEsquerda(r: Rascunho, chave: string): Rascunho {
  const indice = r.etapas.findIndex((etapa) => etapa.chave === chave);
  if (indice < 0) return r;
  const etapa = r.etapas[indice];
  const vizinha = r.etapas[indice - 1];
  if (!etapa?.movivel || !vizinha || vizinha.papel === 'novo') return r;
  return trocar(r, indice, indice - 1);
}

export function moverParaDireita(r: Rascunho, chave: string): Rascunho {
  const indice = r.etapas.findIndex((etapa) => etapa.chave === chave);
  if (indice < 0) return r;
  const etapa = r.etapas[indice];
  const vizinha = r.etapas[indice + 1];
  if (!etapa?.movivel || !vizinha || vizinha.papel === 'ganho') return r;
  return trocar(r, indice, indice + 1);
}

export function paraPedido(r: Rascunho): { id?: string; nome: string }[] {
  return r.etapas.map((etapa) => (etapa.nova ? { nome: etapa.nome } : { id: etapa.id, nome: etapa.nome }));
}
