import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantService } from '@/services/api';
import AdsCallbackPage from './page';

// google-ads-conectar-no-admin RF-06 (Verifier B1): o retorno do CRM trata todo
// state como tenant; MASTER não tem caminho próprio (a API recusa com 403).
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push }),
}));
vi.mock('@/services/api', () => ({ TenantService: { googleAdsCallback: vi.fn() } }));

describe('Retorno do Google Ads no CRM', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    nav.push.mockReset();
    vi.mocked(TenantService.googleAdsCallback).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sucesso volta para o kanban, qualquer que seja o state', async () => {
    vi.mocked(TenantService.googleAdsCallback).mockResolvedValue(undefined);
    nav.params = new URLSearchParams('code=c1&state=MASTER');
    render(<AdsCallbackPage />);
    expect(await screen.findByText('Google Ads conectado com sucesso!')).toBeInTheDocument();
    vi.advanceTimersByTime(3000);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/kanban'));
    expect(nav.push).not.toHaveBeenCalledWith('/tenants');
  });

  it('MASTER recusado pela API mostra a falha', async () => {
    vi.mocked(TenantService.googleAdsCallback).mockRejectedValue({ response: { status: 403, data: { error: 'Forbidden' } } });
    nav.params = new URLSearchParams('code=c1&state=MASTER');
    render(<AdsCallbackPage />);
    expect(await screen.findByText('Falha ao vincular conta: Forbidden')).toBeInTheDocument();
  });
});
