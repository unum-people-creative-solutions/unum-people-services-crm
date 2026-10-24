/**
 * O resultado do envio da venda ao Google Ads, como o ads-worker gravou em
 * `sale.ads` (e o motivo do Google em `sale.ads_motivo`). Sem `ads` (venda
 * antiga ou tenant sem Ads), não mostra nada. Spec ads-status-final RF-07.
 */
const TEXTOS: Record<string, string> = {
  pendente: 'aguardando envio',
  enviada: 'enviada, aguardando o Google',
  aceita: 'aceita',
  sem_resposta: 'enviada, sem confirmação do Google',
  sem_gclid: 'não enviada: o contato não veio de anúncio',
  fora_da_janela: 'não enviada: o clique no anúncio tem mais de 90 dias',
  sem_acao: 'não enviada: conta ou ação de conversão não configurada',
};

function textoDoStatus(ads: string, motivo?: string): string {
  if (ads === 'recusada') {
    return motivo?.includes('EXPIRED_CLICK')
      ? 'recusada: o clique no anúncio tem mais de 90 dias'
      : 'recusada pelo Google';
  }
  return TEXTOS[ads] ?? ads;
}

export function StatusAdsDaVenda({ ads, motivo }: { ads?: string; motivo?: string }) {
  if (!ads) return null;
  return <p className="mt-1 text-[11px] text-gray-500">{`Google Ads: ${textoDoStatus(ads, motivo)}`}</p>;
}
