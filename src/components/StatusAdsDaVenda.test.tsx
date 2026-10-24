import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusAdsDaVenda } from './StatusAdsDaVenda';

// ads-status-final T08 / RF-07: o texto de cada estado do envio ao Google Ads.
const CASOS: [string, string | undefined, string][] = [
  ['pendente', undefined, 'Google Ads: aguardando envio'],
  ['enviada', undefined, 'Google Ads: enviada, aguardando o Google'],
  ['aceita', undefined, 'Google Ads: aceita'],
  ['recusada', 'PROCESSING_ERROR_REASON_EXPIRED_CLICK', 'Google Ads: recusada: o clique no anúncio tem mais de 90 dias'],
  ['recusada', 'PROCESSING_ERROR_REASON_INVALID_GCLID', 'Google Ads: recusada pelo Google'],
  ['recusada', undefined, 'Google Ads: recusada pelo Google'],
  ['sem_resposta', undefined, 'Google Ads: enviada, sem confirmação do Google'],
  ['sem_gclid', undefined, 'Google Ads: não enviada: o contato não veio de anúncio'],
  ['fora_da_janela', undefined, 'Google Ads: não enviada: o clique no anúncio tem mais de 90 dias'],
  ['sem_acao', undefined, 'Google Ads: não enviada: conta ou ação de conversão não configurada'],
  ['estado_novo', undefined, 'Google Ads: estado_novo'],
];

describe('StatusAdsDaVenda (ads-status-final T08)', () => {
  it.each(CASOS)('ads=%s motivo=%s mostra "%s"', (ads, motivo, texto) => {
    const { container } = render(<StatusAdsDaVenda ads={ads} motivo={motivo} />);
    expect(container.textContent).toBe(texto);
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it('sem ads, não mostra nada', () => {
    const { container } = render(<StatusAdsDaVenda ads={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
