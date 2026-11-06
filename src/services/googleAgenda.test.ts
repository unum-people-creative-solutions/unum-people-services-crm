import { describe, it, expect, vi, afterEach } from 'vitest';
import api, {
  GoogleAgendaService,
  LeadService,
  type AgendaGoogle,
  type ConexaoGoogleAgenda,
  type IntervaloOcupado,
  type LeadGoogleAgenda,
  type ResultadoGoogleAgenda,
} from './api';
import conectada from './__fixtures__/google-agenda-conectada.json';
import caida from './__fixtures__/google-agenda-caida.json';
import agendas from './__fixtures__/google-agenda-agendas.json';
import ocupado from './__fixtures__/google-agenda-ocupado.json';
import putOk from './__fixtures__/put-lead-google-agenda-ok.json';
import putFalhou from './__fixtures__/put-lead-google-agenda-falhou.json';
import leadDoGet from './__fixtures__/get-leads-lead-google-agenda.json';

// crm-google-agenda TASK-FE-01: o contrato das 7 rotas do RF-07 e dos campos novos de
// PUT/GET /leads (RF-14, RF-15), com o JSON real gerado pelo teste da API
// (TestGoogleAgendaLocal_RotasEFixtures, DynamoDB Local) em __fixtures__.

// Nenhum tipo do front tem chave com "token" (TECH-DESIGN §8): checado pelo tsc.
type SemToken<T> = Extract<keyof T, `${string}token${string}`> extends never ? true : false;
const tiposSemToken: [
  SemToken<ConexaoGoogleAgenda>,
  SemToken<AgendaGoogle>,
  SemToken<IntervaloOcupado>,
  SemToken<ResultadoGoogleAgenda>,
  SemToken<LeadGoogleAgenda>,
] = [true, true, true, true, true];

const temChaveComToken = (valor: unknown): boolean =>
  JSON.stringify(valor).toLowerCase().includes('token');

describe('GoogleAgendaService (RF-07)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('situacao: GET /integracoes/google-agenda com o tenant_id codificado; devolve o JSON da API', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: conectada });
    await expect(GoogleAgendaService.situacao('a b')).resolves.toEqual(conectada);
    expect(get).toHaveBeenCalledWith('/integracoes/google-agenda?tenant_id=a%20b');
  });

  it('conectar: POST /integracoes/google-agenda/conectar com corpo exatamente {code, redirect_uri}', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: conectada });
    await expect(
      GoogleAgendaService.conectar('t1', '4/codigo', 'https://crm.unumpeople.com.br/settings/google-agenda/callback'),
    ).resolves.toEqual(conectada);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, corpo] = post.mock.calls[0];
    expect(url).toBe('/integracoes/google-agenda/conectar?tenant_id=t1');
    expect(corpo).toStrictEqual({
      code: '4/codigo',
      redirect_uri: 'https://crm.unumpeople.com.br/settings/google-agenda/callback',
    });
  });

  it('agendas: GET /integracoes/google-agenda/agendas', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: agendas });
    await expect(GoogleAgendaService.agendas('t1')).resolves.toEqual(agendas);
    expect(get).toHaveBeenCalledWith('/integracoes/google-agenda/agendas?tenant_id=t1');
  });

  it('configurar: PUT /integracoes/google-agenda com exatamente {agenda_id, duracao_padrao_min}', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: conectada });
    await GoogleAgendaService.configurar('t1', {
      agenda_id: 'y@group.calendar.google.com',
      duracao_padrao_min: 45,
      extra: 'x',
    } as never);
    expect(put).toHaveBeenCalledWith('/integracoes/google-agenda?tenant_id=t1', {
      agenda_id: 'y@group.calendar.google.com',
      duracao_padrao_min: 45,
    });
  });

  it('desconectar: DELETE /integracoes/google-agenda', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ status: 204, data: '' });
    await GoogleAgendaService.desconectar('t1');
    expect(del).toHaveBeenCalledWith('/integracoes/google-agenda?tenant_id=t1');
  });

  it('ocupado: GET /integracoes/google-agenda/ocupado com tenant_id, inicio, fim e lead', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: ocupado });
    await expect(
      GoogleAgendaService.ocupado('t1', '2026-11-11T12:00:00Z', '2026-11-11T23:00:00Z', 'l1'),
    ).resolves.toEqual(ocupado.ocupado);
    expect(get).toHaveBeenCalledWith(
      '/integracoes/google-agenda/ocupado?tenant_id=t1&inicio=2026-11-11T12%3A00%3A00Z&fim=2026-11-11T23%3A00%3A00Z&lead=l1',
    );
  });

  it('ocupado sem lead não manda o parâmetro lead', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: ocupado });
    await GoogleAgendaService.ocupado('t1', '2026-11-11T12:00:00Z', '2026-11-11T23:00:00Z');
    expect(get).toHaveBeenCalledWith(
      '/integracoes/google-agenda/ocupado?tenant_id=t1&inicio=2026-11-11T12%3A00%3A00Z&fim=2026-11-11T23%3A00%3A00Z',
    );
  });

  it('tentarDeNovo: POST /leads/{id}/google-agenda sem corpo; devolve google_agenda', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { google_agenda: putOk.google_agenda } });
    await expect(GoogleAgendaService.tentarDeNovo('t1', 'l1')).resolves.toEqual(putOk.google_agenda);
    expect(post).toHaveBeenCalledWith('/leads/l1/google-agenda?tenant_id=t1');
  });

  it('o erro da API sobe para quem chamou (não é engolido)', async () => {
    const erro = { response: { status: 409, data: { error: 'agenda_indisponivel' } } };
    vi.spyOn(api, 'post').mockRejectedValue(erro);
    await expect(GoogleAgendaService.tentarDeNovo('t1', 'l1')).rejects.toBe(erro);
  });
});

describe('Campos novos de PUT /leads/{id} (RF-15, RF-26)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('agendar com a integração: corpo exatamente {status, agendado_em, duracao_min, google_agenda}', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: putOk });
    await expect(
      LeadService.agendar('l1', '2026-11-11T18:00:00Z', 't1', { duracao_min: 50, google_agenda: true }),
    ).resolves.toEqual(putOk);
    const [url, corpo] = put.mock.calls[0];
    expect(url).toBe('/leads/l1?tenant_id=t1');
    expect(corpo).toStrictEqual({ status: 'AGENDADO', agendado_em: '2026-11-11T18:00:00Z', duracao_min: 50, google_agenda: true });
  });

  it('agendar sem a integração continua com o corpo de antes', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    await LeadService.agendar('l1', '2026-11-11T18:00:00Z', 't1');
    expect(put.mock.calls[0][1]).toStrictEqual({ status: 'AGENDADO', agendado_em: '2026-11-11T18:00:00Z' });
  });

  it('a resposta com falha do Google chega a quem chamou', async () => {
    vi.spyOn(api, 'put').mockResolvedValue({ data: putFalhou });
    const resposta = await LeadService.agendar('l1', '2026-11-11T18:00:00Z', 't1', { duracao_min: 45, google_agenda: false });
    expect(resposta.google_agenda).toEqual({ situacao: 'falhou' });
  });

  it('updateStatus com remover_da_agenda: true e false entram no corpo', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    await LeadService.updateStatus('l1', 'PERDIDO', 0, undefined, 't1', true);
    await LeadService.updateStatus('l1', 'PERDIDO', 0, undefined, 't1', false);
    expect(put.mock.calls[0]).toEqual(['/leads/l1?tenant_id=t1', { status: 'PERDIDO', valor_venda: 0, data_venda: undefined, remover_da_agenda: true }]);
    expect(put.mock.calls[1][1]).toStrictEqual({ status: 'PERDIDO', valor_venda: 0, data_venda: undefined, remover_da_agenda: false });
  });

  it('updateStatus sem a escolha não manda remover_da_agenda', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
    await LeadService.updateStatus('l1', 'PERDIDO', 0, undefined, 't1');
    expect(Object.keys(put.mock.calls[0][1] as object)).toEqual(['status', 'valor_venda', 'data_venda']);
  });
});

describe('Fixtures reais e tipos sem token (RF-02, RF-14)', () => {
  it('nenhuma resposta da API usada pelo front tem chave com "token"', () => {
    for (const corpo of [conectada, caida, agendas, ocupado, putOk, putFalhou, leadDoGet]) {
      expect(temChaveComToken(corpo)).toBe(false);
    }
    expect(tiposSemToken).toEqual([true, true, true, true, true]);
  });
});
