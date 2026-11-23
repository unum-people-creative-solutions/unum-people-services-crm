import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { OrigensService, ORIGENS_PADRAO } from './api';
import origensPadrao from './__fixtures__/get-crm-origens-padrao.json';
import origensSalvas from './__fixtures__/put-crm-origens-feira.json';

// spec: crm-origens-personalizadas T17 (TECH-DESIGN §3.2). As fixtures têm o formato do contrato da API.

describe('OrigensService (T17)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('as 5 padrão do cliente são as mesmas do contrato da API sem lista gravada', () => {
    expect(ORIGENS_PADRAO).toEqual(origensPadrao.itens);
  });

  it('ler faz GET /crm/origens com o tenant_id codificado', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: origensPadrao });

    await expect(OrigensService.ler('t 1')).resolves.toEqual({
      versao: 0,
      itens: ['Indicação', 'WhatsApp', 'Instagram', 'Facebook', 'Outro'],
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/crm/origens?tenant_id=t%201');
  });

  it('ler sem tenant não leva query', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: origensPadrao });
    await OrigensService.ler();
    expect(get).toHaveBeenCalledWith('/crm/origens');
  });

  it('salvar faz PUT /crm/origens com o corpo exatamente {versao, itens} e devolve a lista salva', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: origensSalvas });
    const itens = ['Indicação', 'WhatsApp', 'Instagram', 'Facebook', 'Outro', 'Feira'];

    const salvo = await OrigensService.salvar(0, itens, 't 1');

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('/crm/origens?tenant_id=t%201', { versao: 0, itens });
    expect(salvo).toEqual({ versao: 1, itens });
  });
});
