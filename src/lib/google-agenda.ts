// Conexão com o Google Agenda (spec crm-google-agenda RF-20; TECH-DESIGN D-GA-3).
// Diferente do Google Ads, o state é aleatório e fica no sessionStorage com o
// tenant_id: o retorno só chama a API se o state voltar igual. Nenhum segredo aqui:
// só o client id público.

export const CHAVE_CONEXAO_GOOGLE_AGENDA = 'google_agenda_oauth';
export const CAMINHO_RETORNO_GOOGLE_AGENDA = '/settings/google-agenda/callback';

const ESCOPOS = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');

// Guarda {state, tenant_id} e devolve a URL de consentimento (sem include_granted_scopes).
export function prepararConexaoGoogleAgenda(tenantId: string): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(CHAVE_CONEXAO_GOOGLE_AGENDA, JSON.stringify({ state, tenant_id: tenantId }));

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
    redirect_uri: `${window.location.origin}${CAMINHO_RETORNO_GOOGLE_AGENDA}`,
    response_type: 'code',
    scope: ESCOPOS,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
