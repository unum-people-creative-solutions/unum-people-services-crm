import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_CONEXAO_GOOGLE_AGENDA, prepararConexaoGoogleAgenda } from './google-agenda';

// crm-google-agenda RF-20 / CA-22 (URL): parâmetros comparados um a um; state aleatório
// guardado em sessionStorage com o tenant_id.
describe('prepararConexaoGoogleAgenda', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'cliente-123.apps.googleusercontent.com');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('monta a URL de consentimento com exatamente os parâmetros do RF-20', () => {
    const url = new URL(prepararConexaoGoogleAgenda('tenant-1'));
    const guardado = JSON.parse(sessionStorage.getItem('google_agenda_oauth') as string);

    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(
      ['access_type', 'client_id', 'prompt', 'redirect_uri', 'response_type', 'scope', 'state'],
    );
    expect(url.searchParams.get('client_id')).toBe('cliente-123.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/settings/google-agenda/callback`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    );
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe(guardado.state);
    expect(url.searchParams.has('include_granted_scopes')).toBe(false);
  });

  it('guarda {state, tenant_id} na chave google_agenda_oauth, com state UUID', () => {
    prepararConexaoGoogleAgenda('tenant-1');
    expect(CHAVE_CONEXAO_GOOGLE_AGENDA).toBe('google_agenda_oauth');
    const guardado = JSON.parse(sessionStorage.getItem('google_agenda_oauth') as string);
    expect(Object.keys(guardado).sort()).toEqual(['state', 'tenant_id']);
    expect(guardado.tenant_id).toBe('tenant-1');
    expect(guardado.state).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('dois cliques geram state diferentes', () => {
    const primeiro = new URL(prepararConexaoGoogleAgenda('tenant-1')).searchParams.get('state');
    const segundo = new URL(prepararConexaoGoogleAgenda('tenant-1')).searchParams.get('state');
    expect(primeiro).not.toBe(segundo);
    expect(JSON.parse(sessionStorage.getItem('google_agenda_oauth') as string).state).toBe(segundo);
  });
});
