import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { AdsConfigService } from './api';

// funil-configurador-f1, achado B7 do Verifier: o contrato real com a API (método,
// URL, tenant_id na query que o authz lê e as três chaves do corpo), sem mockar o serviço.
describe('AdsConfigService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lê GET /integracoes/google-ads com o tenant_id codificado', async () => {
    const corpo = { conectado: true, google_ads_customer_id: '123-456-7890', ads_conversion_action_id: '1', ads_recurring_conversion_action_id: '' };
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: corpo });
    await expect(AdsConfigService.get('a b')).resolves.toEqual(corpo);
    expect(get).toHaveBeenCalledWith('/integracoes/google-ads?tenant_id=a%20b');
  });

  it('grava PUT com exatamente as três chaves', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    await AdsConfigService.update('t1', {
      google_ads_customer_id: '123-456-7890',
      ads_conversion_action_id: '1',
      ads_recurring_conversion_action_id: '2',
      extra: 'x',
    } as never);
    expect(put).toHaveBeenCalledWith('/integracoes/google-ads?tenant_id=t1', {
      google_ads_customer_id: '123-456-7890',
      ads_conversion_action_id: '1',
      ads_recurring_conversion_action_id: '2',
    });
  });
});
