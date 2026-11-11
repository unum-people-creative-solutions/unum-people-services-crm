import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import AuthGuard from "./AuthGuard";
import { useAuthStore } from "@/store/authStore";
import { usePathname } from "next/navigation";
import { jwtDecode } from "jwt-decode";
import { redirectToHostedUI } from "@/lib/pkce";
import { CobrancaService } from "@/services/api";
import { ACTIVE_TENANT_CHANGE_EVENT, ACTIVE_TENANT_KEY } from "@/lib/activeTenant";
import type { ResumoDeCobranca } from "@/types/cobranca";
import { resumoBloqueado, resumoEmDia, resumoForaDoAr } from "@/services/__fixtures__/cobranca";

// Mocks
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("jwt-decode", () => ({
  jwtDecode: vi.fn(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign(vi.fn(), {
    persist: {
      onFinishHydration: vi.fn(),
      hasHydrated: vi.fn(),
    },
  }),
}));

vi.mock("./PendingTermsGate", () => ({
  default: () => <div data-testid="pending-terms-gate" />,
}));

vi.mock("@/lib/pkce", () => ({
  redirectToHostedUI: vi.fn(async () => {}),
}));

// Tela de bloqueio por cobrança (TASK-FE-C05): o conteúdo é testado em
// TelaDeBloqueioCobranca.test.tsx; aqui só o que o AuthGuard passa a ela.
vi.mock("./TelaDeBloqueioCobranca", () => ({
  default: ({ tenantId, resumo, recarregar }: any) => (
    <main data-testid="tela-de-bloqueio">
      <h1>Acesso bloqueado por fatura em atraso</h1>
      <p>{`empresa=${tenantId} situacao=${resumo?.situacao ?? "nenhuma"}`}</p>
      <button type="button" onClick={() => recarregar().catch(() => {})}>
        reler
      </button>
    </main>
  ),
}));

vi.mock("@/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api")>()),
  CobrancaService: { resumo: vi.fn() },
}));

describe("AuthGuard", () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    (usePathname as any).mockReturnValue("/dashboard");

    // Mock default persist behavior (already hydrated)
    (useAuthStore.persist.hasHydrated as any).mockReturnValue(true);
    (useAuthStore.persist.onFinishHydration as any).mockReturnValue(() => {});

    // Mock default jwt-decode behavior (valid token)
    (jwtDecode as any).mockReturnValue({ exp: Date.now() / 1000 + 10000 });

    // Default store state
    (useAuthStore as any).mockReturnValue({
      isAuthenticated: true,
      session: { token: "valid-token", email: "test@example.com" },
      logout: mockLogout,
    });
  });

  it("deve exibir spinner de carregamento quando não hidratado", () => {
    (useAuthStore.persist.hasHydrated as any).mockReturnValue(false);

    render(
      <AuthGuard>
        <div>Content</div>
      </AuthGuard>
    );

    expect(screen.getByRole("status", { hidden: true })).toBeInTheDocument();
  });

  it("deve renderizar children se o usuário estiver autenticado em rota privada", async () => {
    render(
      <AuthGuard>
        <div data-testid="child-content">Content</div>
      </AuthGuard>
    );

    await waitFor(() => {
      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });
  });

  it("deve renderizar children em rotas públicas sem autenticação", async () => {
    (usePathname as any).mockReturnValue("/");
    (useAuthStore as any).mockReturnValue({
      isAuthenticated: false,
      session: null,
      logout: mockLogout,
    });

    render(
      <AuthGuard>
        <div data-testid="child-content">Content</div>
      </AuthGuard>
    );

    await waitFor(() => {
      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });
  });

  describe("TASK-FE-CRM-001 — Redirect para o Hosted UI (Cognito)", () => {
    it("aciona redirectToHostedUI com o pathname atual se não autenticado em rota privada — nunca mais /login interno", async () => {
      (usePathname as any).mockReturnValue("/dashboard");
      (useAuthStore as any).mockReturnValue({
        isAuthenticated: false,
        session: null,
        logout: mockLogout,
      });

      render(
        <AuthGuard>
          <div>Content</div>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(redirectToHostedUI).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("nunca renderiza children em rota privada sem sessão válida — evita expor o 404 por trás enquanto o redirect está em andamento", async () => {
      (useAuthStore as any).mockReturnValue({
        isAuthenticated: false,
        session: null,
        logout: mockLogout,
      });

      render(
        <AuthGuard>
          <div data-testid="pagina-404-real">Página não encontrada</div>
        </AuthGuard>
      );

      expect(screen.queryByTestId("pagina-404-real")).not.toBeInTheDocument();
    });

    it("aciona redirectToHostedUI se o token estiver expirado", async () => {
      const expiredTime = Date.now() / 1000 - 1000;
      (jwtDecode as any).mockReturnValue({ exp: expiredTime });

      render(
        <AuthGuard>
          <div>Content</div>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(redirectToHostedUI).toHaveBeenCalledWith("/dashboard");
      });
    });

    it("aciona redirectToHostedUI se a decodificação do token falhar", async () => {
      (jwtDecode as any).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      render(
        <AuthGuard>
          <div>Content</div>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(redirectToHostedUI).toHaveBeenCalledWith("/dashboard");
      });
    });
  });

  describe("PendingTermsGate integration", () => {
    it("deve exibir PendingTermsGate em rotas privadas autenticadas", async () => {
      (usePathname as any).mockReturnValue("/dashboard");
      render(
        <AuthGuard>
          <div data-testid="child-content">Content</div>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(screen.getByTestId("pending-terms-gate")).toBeInTheDocument();
      });
    });

    it("não deve exibir PendingTermsGate em rotas públicas", async () => {
      (usePathname as any).mockReturnValue("/");
      (useAuthStore as any).mockReturnValue({
        isAuthenticated: false,
        session: null,
        logout: mockLogout,
      });

      render(
        <AuthGuard>
          <div data-testid="child-content">Content</div>
        </AuthGuard>
      );

      await waitFor(() => {
        expect(screen.queryByTestId("pending-terms-gate")).not.toBeInTheDocument();
      });
    });
  });
});

// spec cobranca-e-plano-do-cliente RF2-53, BP-T §8.3 e §15.3 ("Bloqueio",
// "Troca de empresa"), UI-3 e UI-4 alterada (Decisões de 10/11/2026).
describe("AuthGuard — tela de bloqueio por cobrança (RF2-53)", () => {
  const mockLogout = vi.fn();
  const TITULO = "Acesso bloqueado por fatura em atraso";
  const AVISO_UI4 = "Não conseguimos conferir a situação da conta agora.";
  const resumo = CobrancaService.resumo as unknown as ReturnType<typeof vi.fn>;

  function renderGuard() {
    return render(
      <AuthGuard>
        <div data-testid="child-content">Content</div>
      </AuthGuard>
    );
  }

  function adiado<T>() {
    let resolver!: (v: T) => void;
    let rejeitar!: (e: unknown) => void;
    const promessa = new Promise<T>((res, rej) => {
      resolver = res;
      rejeitar = rej;
    });
    return { promessa, resolver, rejeitar };
  }

  function trocarEmpresa(id: string) {
    sessionStorage.setItem(ACTIVE_TENANT_KEY, id);
    window.dispatchEvent(new CustomEvent(ACTIVE_TENANT_CHANGE_EVENT, { detail: id }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem(ACTIVE_TENANT_KEY, "t1");
    (usePathname as any).mockReturnValue("/kanban");
    (useAuthStore.persist.hasHydrated as any).mockReturnValue(true);
    (useAuthStore.persist.onFinishHydration as any).mockReturnValue(() => {});
    (jwtDecode as any).mockReturnValue({ exp: Date.now() / 1000 + 10000 });
    (useAuthStore as any).mockReturnValue({
      isAuthenticated: true,
      session: { token: "valid-token", email: "test@example.com" },
      logout: mockLogout,
    });
    resumo.mockResolvedValue(resumoEmDia);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("crm em ferramentas_bloqueadas: a tela entra no lugar de children e o PendingTermsGate não aparece", async () => {
    resumo.mockResolvedValue(resumoBloqueado);
    renderGuard();

    expect(await screen.findByRole("heading", { level: 1, name: TITULO })).toBeInTheDocument();
    expect(screen.getByText("empresa=t1 situacao=bloqueado")).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-terms-gate")).not.toBeInTheDocument();
    expect(resumo).toHaveBeenCalledWith("t1");
  });

  it("Pausado (fora_do_ar) com crm bloqueado também mostra a tela", async () => {
    resumo.mockResolvedValue(resumoForaDoAr);
    renderGuard();
    expect(await screen.findByText("empresa=t1 situacao=fora_do_ar")).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
  });

  it("em dia: children e PendingTermsGate, sem tela", async () => {
    renderGuard();
    expect(await screen.findByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByTestId("pending-terms-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("tela-de-bloqueio")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("outras ferramentas bloqueadas sem o crm: o CRM abre", async () => {
    resumo.mockResolvedValue({ ...resumoBloqueado, ferramentas_bloqueadas: ["blog", "lp"] });
    renderGuard();
    expect(await screen.findByTestId("child-content")).toBeInTheDocument();
    expect(screen.queryByTestId("tela-de-bloqueio")).not.toBeInTheDocument();
  });

  it("sem empresa no sessionStorage, consulta a do token (custom:tenant_id)", async () => {
    sessionStorage.clear();
    (jwtDecode as any).mockReturnValue({ exp: Date.now() / 1000 + 10000, "custom:tenant_id": "t-token" });
    renderGuard();
    await screen.findByTestId("child-content");
    expect(resumo).toHaveBeenCalledWith("t-token");
  });

  it("enquanto o resumo não chega, children não é renderizado (nenhuma chamada do CRM sai antes, UI-3)", async () => {
    const pendente = adiado<ResumoDeCobranca>();
    resumo.mockReturnValue(pendente.promessa);
    renderGuard();

    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => pendente.resolver(resumoEmDia));
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("UI-4: leitura com erro → children + alerta \"Não conseguimos conferir…\" e \"Tentar de novo\" relê", async () => {
    resumo.mockRejectedValueOnce({ response: { status: 500, data: { error: "internal_error" } } });
    renderGuard();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(AVISO_UI4);
    expect(screen.getByTestId("child-content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(resumo).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("UI-4: o \"Tentar de novo\" que acha a conta bloqueada mostra a tela", async () => {
    resumo.mockRejectedValueOnce(new Error("rede"));
    renderGuard();
    await screen.findByRole("alert");
    resumo.mockResolvedValue(resumoBloqueado);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByTestId("tela-de-bloqueio")).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
  });

  it("evento \"unum:cobranca-bloqueada\" (segunda barreira) troca children pela tela e relê o resumo", async () => {
    renderGuard();
    await screen.findByTestId("child-content");
    resumo.mockResolvedValue(resumoBloqueado);

    act(() => {
      window.dispatchEvent(new CustomEvent("unum:cobranca-bloqueada"));
    });

    expect(screen.getByTestId("tela-de-bloqueio")).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pending-terms-gate")).not.toBeInTheDocument();
    expect(await screen.findByText("empresa=t1 situacao=bloqueado")).toBeInTheDocument();
    expect(resumo).toHaveBeenCalledTimes(2);
  });

  it("a tela continua depois de o resumo liberar o crm, recebendo o resumo novo (para mostrar \"Pagamento confirmado\")", async () => {
    resumo.mockResolvedValue(resumoBloqueado);
    renderGuard();
    await screen.findByText("empresa=t1 situacao=bloqueado");

    resumo.mockResolvedValue(resumoEmDia);
    fireEvent.click(screen.getByRole("button", { name: "reler" }));

    expect(await screen.findByText("empresa=t1 situacao=em_dia")).toBeInTheDocument();
    expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();
  });

  it("falha na releitura com a tela aberta não tira a tela (a espera mostra o próprio aviso)", async () => {
    resumo.mockResolvedValue(resumoBloqueado);
    renderGuard();
    await screen.findByText("empresa=t1 situacao=bloqueado");

    resumo.mockRejectedValue(new Error("rede"));
    fireEvent.click(screen.getByRole("button", { name: "reler" }));
    await waitFor(() => expect(resumo).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(screen.getByTestId("tela-de-bloqueio")).toBeInTheDocument();
    expect(screen.queryByText(AVISO_UI4)).not.toBeInTheDocument();
  });

  it("troca de empresa: ACTIVE_TENANT_CHANGE_EVENT relê o resumo da empresa nova e, liberada, mostra o CRM", async () => {
    resumo.mockImplementation(async (id: string) => (id === "t1" ? resumoBloqueado : resumoEmDia));
    renderGuard();
    await screen.findByTestId("tela-de-bloqueio");

    act(() => trocarEmpresa("t2"));

    expect(await screen.findByTestId("child-content")).toBeInTheDocument();
    expect(resumo).toHaveBeenLastCalledWith("t2");
    expect(screen.queryByTestId("tela-de-bloqueio")).not.toBeInTheDocument();
  });

  it("troca de empresa: a resposta atrasada da empresa anterior é descartada", async () => {
    const daT1 = adiado<ResumoDeCobranca>();
    resumo.mockImplementation((id: string) => (id === "t1" ? daT1.promessa : Promise.resolve(resumoEmDia)));
    renderGuard();

    act(() => trocarEmpresa("t2"));
    await screen.findByTestId("child-content");

    await act(async () => daT1.resolver(resumoBloqueado));
    expect(screen.queryByTestId("tela-de-bloqueio")).not.toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("o aviso da mesma empresa (TenantProvider ao montar) não relê o resumo", async () => {
    renderGuard();
    await screen.findByTestId("child-content");
    act(() => trocarEmpresa("t1"));
    expect(resumo).toHaveBeenCalledTimes(1);
  });

  it("rota pública nunca consulta o resumo, mesmo autenticado", async () => {
    for (const rota of ["/", "/auth/callback"]) {
      (usePathname as any).mockReturnValue(rota);
      const { unmount } = renderGuard();
      await screen.findByTestId("child-content");
      unmount();
    }
    expect(resumo).not.toHaveBeenCalled();
  });

  it("sem sessão não consulta o resumo", async () => {
    (useAuthStore as any).mockReturnValue({ isAuthenticated: false, session: null, logout: mockLogout });
    renderGuard();
    await waitFor(() => expect(redirectToHostedUI).toHaveBeenCalled());
    expect(resumo).not.toHaveBeenCalled();
  });

  // DV-14 revista em 11/11/2026 (validation-f2-portal-crm.md, L1): o operador
  // (grupo GlobalAdmin) não vê a tela de bloqueio; a API também o libera.
  describe("operador (GlobalAdmin)", () => {
    beforeEach(() => {
      (useAuthStore as any).mockReturnValue({
        isAuthenticated: true,
        session: { token: "valid-token", email: "operador@unumpeople.com.br", role: "GlobalAdmin" },
        logout: mockLogout,
      });
      resumo.mockResolvedValue(resumoBloqueado);
    });

    it("com a empresa ativa suspensa vê o app normalmente, sem a tela e sem consultar o resumo", async () => {
      renderGuard();
      expect(await screen.findByTestId("child-content")).toBeInTheDocument();
      expect(screen.getByTestId("pending-terms-gate")).toBeInTheDocument();
      expect(screen.queryByTestId("tela-de-bloqueio")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: TITULO })).not.toBeInTheDocument();
      expect(resumo).not.toHaveBeenCalled();
    });

    it("o evento \"unum:cobranca-bloqueada\" não troca o app pela tela", async () => {
      renderGuard();
      await screen.findByTestId("child-content");
      act(() => {
        window.dispatchEvent(new CustomEvent("unum:cobranca-bloqueada"));
      });
      await act(async () => {});
      expect(screen.getByTestId("child-content")).toBeInTheDocument();
      expect(screen.queryByTestId("tela-de-bloqueio")).not.toBeInTheDocument();
    });
  });
});
