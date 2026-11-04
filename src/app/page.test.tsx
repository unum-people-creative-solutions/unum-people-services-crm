import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import Raiz from "./page";
import { useAuthStore } from "@/store/authStore";
import { logoutFromHostedUI, AUTH_RETURN_TO_STORAGE_KEY } from "@/lib/pkce";

// crm-raiz-vai-ao-login: a raiz não tem página de apresentação. Sem sessão vai
// ao login do Cognito; com sessão vai ao quadro (ou à lista de clientes do operador).

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const AUTHORIZE = "https://auth.unumpeople.com.br/oauth2/authorize";
const ORIGEM = "https://crm.unumpeople.com.br";
const locationOriginal = window.location;

// JWT de verdade (só o payload importa para o jwtDecode), com expiração relativa a agora.
function token(expiraEmSegundos: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + expiraEmSegundos })}.assinatura`;
}

function entrarComo(role: string, expiraEmSegundos: number) {
  useAuthStore.getState().setSession({
    email: "pessoa@exemplo.com",
    name: "Pessoa",
    tenantId: "t-1",
    role,
    token: token(expiraEmSegundos),
  });
}

describe("Raiz do CRM (crm-raiz-vai-ao-login)", () => {
  beforeEach(() => {
    replace.mockClear();
    window.sessionStorage.clear();
    window.localStorage.clear();
    useAuthStore.getState().logout();
    delete (window as any).location;
    window.location = { href: "", origin: ORIGEM } as any;
    process.env.NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN = "https://auth.unumpeople.com.br";
    process.env.NEXT_PUBLIC_COGNITO_CRM_CLIENT_ID = "crm-client-id";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.location = locationOriginal as any;
  });

  it("CA-01: sem sessão, vai ao login do Cognito com retorno para a raiz", async () => {
    render(<Raiz />);

    await waitFor(() => expect(window.location.href).toContain(AUTHORIZE));
    const url = new URL(window.location.href);
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGEM}/auth/callback`);
    expect(window.sessionStorage.getItem(AUTH_RETURN_TO_STORAGE_KEY)).toBe("/");
    expect(replace).not.toHaveBeenCalled();
  });

  it("CA-02: logo depois do Sair (trava do logout ativa), a raiz ainda leva ao login", async () => {
    logoutFromHostedUI();
    expect(window.location.href).toContain("/logout");
    // O Cognito devolve a pessoa à raiz: documento novo, mesma aba.
    window.location = { href: `${ORIGEM}/`, origin: ORIGEM } as any;

    render(<Raiz />);

    await waitFor(() => expect(window.location.href).toContain(AUTHORIZE));
  });

  it("CA-04: sessão válida de usuário vai direto ao quadro, sem passar pelo Cognito", async () => {
    entrarComo("USER", 3600);

    render(<Raiz />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/kanban"));
    expect(window.location.href).toBe("");
    // A sessão segue de pé: senão o AuthGuard do quadro mandaria de novo ao Cognito.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().session?.role).toBe("USER");
  });

  it("CA-05: sessão válida do operador vai à lista de clientes", async () => {
    entrarComo("GlobalAdmin", 3600);

    render(<Raiz />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/tenants"));
    expect(window.location.href).toBe("");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().session?.role).toBe("GlobalAdmin");
  });

  it("CA-10: se o login não puder ser aberto, a tela avisa e oferece tentar de novo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN;

    render(<Raiz />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível abrir o login.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Com a configuração de volta, "Tentar novamente" abre o login.
    process.env.NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN = "https://auth.unumpeople.com.br";
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(window.location.href).toContain(AUTHORIZE));
  });

  it("CA-06: sessão expirada é limpa e a raiz leva ao login", async () => {
    entrarComo("USER", -60);

    render(<Raiz />);

    await waitFor(() => expect(window.location.href).toContain(AUTHORIZE));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().session).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("CA-07: não mostra apresentação, só o indicador de carregamento", () => {
    render(<Raiz />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
