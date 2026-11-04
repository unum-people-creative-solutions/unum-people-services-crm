function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildAuthorizeUrl(params: {
  domain: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${params.domain}/oauth2/authorize?${query.toString()}`;
}

export const PKCE_VERIFIER_STORAGE_KEY = "pkce_code_verifier";
export const AUTH_RETURN_TO_STORAGE_KEY = "auth_return_to";

export interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// TASK-FE-CRM-002: troca o `code` (+ code_verifier PKCE) pelos tokens no
// /auth/callback. Falha na troca (rede ou código inválido) sempre lança —
// nunca retorna uma sessão parcial/inválida silenciosamente.
export async function exchangeCodeForTokens(params: {
  domain: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(`${params.domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Falha na troca de código por token (${response.status})`);
  }

  return response.json();
}

function getEnvConfig() {
  const domain = process.env.NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CRM_CLIENT_ID;

  if (!domain) {
    throw new Error("[pkce] Variável de ambiente não configurada: NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN");
  }
  if (!clientId) {
    throw new Error("[pkce] Variável de ambiente não configurada: NEXT_PUBLIC_COGNITO_CRM_CLIENT_ID");
  }

  return { domain, clientId };
}

// BUG DE PRODUÇÃO (2026-07): "Sair" chama `logout()` local (síncrono) antes de
// `logoutFromHostedUI()`. Isso derruba `isAuthenticated`, e no próximo render
// o AuthGuard reage a essa mudança chamando ESTE MESMO `redirectToHostedUI`
// (autorização) — como ele é assíncrono (PKCE), às vezes termina DEPOIS do
// logout explícito e sobrescreve `window.location.href`, reautenticando o
// usuário silenciosamente via SSO (sessão do Hosted UI ainda válida) — o
// logout "não funciona". A janela é curta (é uma corrida entre dois redirects
// no mesmo tick), então uma flag de curta duração basta e se autolimpa.
const LOGOUT_IN_PROGRESS_KEY = "logout_in_progress_at";
const LOGOUT_GUARD_WINDOW_MS = 5000;

function isLogoutInProgress(): boolean {
  const raw = sessionStorage.getItem(LOGOUT_IN_PROGRESS_KEY);
  if (!raw) return false;
  const elapsed = Date.now() - Number(raw);
  return elapsed >= 0 && elapsed < LOGOUT_GUARD_WINDOW_MS;
}

// Compartilhado entre o AuthGuard (rota privada sem sessão) e o interceptor
// axios (401 em qualquer chamada à API) — os dois pontos do app que hoje
// precisam mandar o usuário para reautenticar via Hosted UI, agora que não
// existe mais uma página /login própria do app para navegar internamente.
//
// crm-raiz-vai-ao-login RF-04: o Cognito devolve o "Sair" à raiz, que abre o
// login. A raiz é um documento novo, carregado depois de a navegação do logout
// terminar, então não há corrida a evitar: ela passa `ignorarTravaDeLogout`.
// Os demais chamadores continuam respeitando a trava.
export async function redirectToHostedUI(
  returnTo: string,
  opcoes: { ignorarTravaDeLogout?: boolean } = {},
): Promise<void> {
  if (!opcoes.ignorarTravaDeLogout && isLogoutInProgress()) return;
  const verifier = generateCodeVerifier();
  sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
  sessionStorage.setItem(AUTH_RETURN_TO_STORAGE_KEY, returnTo);
  const codeChallenge = await generateCodeChallenge(verifier);
  const { domain, clientId } = getEnvConfig();
  const url = buildAuthorizeUrl({
    domain,
    clientId,
    redirectUri: `${window.location.origin}/auth/callback`,
    codeChallenge,
  });
  window.location.href = url;
}

// Achado do Verifier (validation-fase2.md, Gap 1): "Sair" chamava
// `redirectToHostedUI`, que só monta uma nova autorização — com a sessão do
// Hosted UI ainda válida, o Cognito reautentica silenciosamente sem exigir
// login de novo, então o usuário nunca saía de fato. Logout real precisa
// passar pelo endpoint `/logout` do Cognito, que encerra a sessão SSO.
export function logoutFromHostedUI(): void {
  sessionStorage.setItem(LOGOUT_IN_PROGRESS_KEY, String(Date.now()));
  const { domain, clientId } = getEnvConfig();
  const logoutUri = `${window.location.origin}/`;
  const query = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUri,
  });
  window.location.href = `${domain}/logout?${query.toString()}`;
}


