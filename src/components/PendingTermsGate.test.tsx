import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import PendingTermsGate from "./PendingTermsGate";
import { useAuthStore } from "@/store/authStore";
import { TermsService } from "@/services/api";
import { logoutFromHostedUI } from "@/lib/pkce";

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  TermsService: {
    getStatus: vi.fn(),
  },
}));

vi.mock("@/lib/pkce", () => ({
  logoutFromHostedUI: vi.fn(),
}));

const fakeJwt = (claims: Record<string, unknown>) => {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
};

const pendingContract = (canAccept: boolean) => ({
  pending: [
    {
      type: "contratacao_servico",
      term_id: "term-9",
      term_name: "Termo de Contratação",
      required_version: 1,
      can_accept: canAccept,
      document_url: "http://cdn/contratacao.html",
    },
  ],
});

const GLOBAL_ADMIN_NOTICE =
  "O termo de contratação desta empresa está pendente. Só um administrador da empresa pode aceitá-lo.";

describe("PendingTermsGate", () => {
  const mockLogout = vi.fn();
  const originalLocation = window.location;

  beforeAll(() => {
    // Permite que window.location.href seja alterado no teste
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "http://localhost/dashboard" },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    (useAuthStore as any).mockReturnValue({ logout: mockLogout });
    window.location.href = "http://localhost/dashboard";
  });

  it("nada pendente = não renderiza nada (return null)", async () => {
    (TermsService.getStatus as any).mockResolvedValue({ pending: [] });

    const { container } = render(<PendingTermsGate />);

    await waitFor(() => {
      expect(TermsService.getStatus).toHaveBeenCalledWith(undefined);
    });

    expect(container.firstChild).toBeNull();
  });

  it("pendente+acionável = modal com CTA que redireciona com return_to codificado", async () => {
    (TermsService.getStatus as any).mockResolvedValue({
      pending: [
        {
          type: "termos_uso",
          term_id: "term-1",
          term_name: "Termos de Uso",
          required_version: 1,
          can_accept: true,
          document_url: "http://cdn/termos.html",
        },
      ],
    });

    render(<PendingTermsGate />);

    await waitFor(() => {
      expect(screen.getByText("Você tem termos pendentes")).toBeInTheDocument();
    });

    // D8: PendingTermsGate nunca renderiza conteúdo do termo nem checkbox —
    // a única ação possível é o redirect pro Portal do Cliente.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Termos de Uso")).not.toBeInTheDocument();
    expect(screen.queryByText("http://cdn/termos.html")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /termos.html/i })).not.toBeInTheDocument();

    const ctaButton = screen.getByRole("button", { name: /ir para o portal do cliente/i });
    fireEvent.click(ctaButton);

    const customersUrl =
      process.env.NEXT_PUBLIC_CUSTOMERS_URL || "https://customer.unumpeople.com.br";
    const expectedUrl = `${customersUrl}?return_to=${encodeURIComponent("http://localhost/dashboard")}`;
    expect(window.location.href).toBe(expectedUrl);
  });

  it("CA-01: pendente em tenant com caractere especial = redireciona com tenant_id e return_to, ambos codificados", async () => {
    sessionStorage.setItem("active-tenant", "t 2&x");
    window.location.href = "http://localhost/dashboard?a=1&b=2#x y";
    (TermsService.getStatus as any).mockResolvedValue({
      pending: [
        {
          type: "contratacao_servico",
          term_id: "term-3",
          term_name: "Termo de Contratação",
          required_version: 1,
          can_accept: true,
          document_url: "http://cdn/contratacao.html",
        },
      ],
    });

    render(<PendingTermsGate />);

    const ctaButton = await screen.findByRole("button", { name: /ir para o portal do cliente/i });
    expect(TermsService.getStatus).toHaveBeenCalledWith("t 2&x");
    fireEvent.click(ctaButton);

    // Valor codificado na URL (espaço e "&" não podem vazar para a query)
    expect(window.location.href).toContain("&tenant_id=t%202%26x");
    const target = new URL(window.location.href);
    expect(target.searchParams.get("tenant_id")).toBe("t 2&x");
    expect(target.searchParams.get("return_to")).toBe("http://localhost/dashboard?a=1&b=2#x y");
    // O return_to precisa estar codificado: o "&" interno não pode virar um 3o parametro.
    expect(Array.from(target.searchParams.keys()).sort()).toEqual(["return_to", "tenant_id"]);
  });

  it("pendente não-acionável = exibe texto de espera do Termo de Contratação", async () => {
    (TermsService.getStatus as any).mockResolvedValue({
      pending: [
        {
          type: "contratacao_servico",
          term_id: "term-2",
          term_name: "Termo de Contratação",
          required_version: 1,
          can_accept: false,
          document_url: "http://cdn/contratacao.html",
        },
      ],
    });

    render(<PendingTermsGate />);

    await waitFor(() => {
      expect(screen.getByText("Aguardando aceite do Termo de Contratação")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /ir para o portal do cliente/i })
    ).not.toBeInTheDocument();

    const logoutButton = screen.getByRole("button", { name: /sair e voltar para o login/i });
    fireEvent.click(logoutButton);

    expect(mockLogout).toHaveBeenCalled();
    expect(logoutFromHostedUI).toHaveBeenCalled();
  });

  it("trata erro na chamada getStatus como pendente e não-acionável (fail-closed)", async () => {
    (TermsService.getStatus as any).mockRejectedValue(new Error("Network error"));

    render(<PendingTermsGate />);

    await waitFor(() => {
      expect(screen.getByText("Aguardando aceite do Termo de Contratação")).toBeInTheDocument();
    });
  });

  it("propaga o tenant ativo do sessionStorage (mesma chave 'active-tenant' do TenantContext) para TermsService.getStatus", async () => {
    sessionStorage.setItem("active-tenant", "tenant-custom-456");
    (TermsService.getStatus as any).mockResolvedValue({ pending: [] });

    render(<PendingTermsGate />);

    await waitFor(() => {
      expect(TermsService.getStatus).toHaveBeenCalledWith("tenant-custom-456");
    });
  });

  it("nunca loga o erro cru (com token no header) no console — só status/mensagem sanitizados", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (TermsService.getStatus as any).mockRejectedValue(new Error("Network error"));

    render(<PendingTermsGate />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Erro ao carregar status dos termos:",
        "Network error"
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it("CA-09: sem tenant ativo salvo, o redirecionamento leva o tenant do token (custom:tenant_id)", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "TenantAdmin", token: fakeJwt({ "custom:tenant_id": "t-3" }) },
    });
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(true));

    render(<PendingTermsGate />);

    const cta = await screen.findByRole("button", { name: /ir para o portal do cliente/i });
    // A consulta sai sem tenant: a API resolve pelo token.
    expect(TermsService.getStatus).toHaveBeenCalledWith(undefined);
    fireEvent.click(cta);

    expect(new URL(window.location.href).searchParams.get("tenant_id")).toBe("t-3");
  });

  it("tenant ativo salvo tem prioridade sobre o tenant do token", async () => {
    sessionStorage.setItem("active-tenant", "t-2");
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "TenantAdmin", token: fakeJwt({ "custom:tenant_id": "t-3" }) },
    });
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(true));

    render(<PendingTermsGate />);

    fireEvent.click(await screen.findByRole("button", { name: /ir para o portal do cliente/i }));

    expect(new URL(window.location.href).searchParams.get("tenant_id")).toBe("t-2");
  });

  it("token ilegível não quebra o gate: redireciona sem tenant_id", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "USER", token: "nao-e-jwt" },
    });
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(true));

    render(<PendingTermsGate />);

    fireEvent.click(await screen.findByRole("button", { name: /ir para o portal do cliente/i }));

    expect(new URL(window.location.href).searchParams.has("tenant_id")).toBe(false);
  });

  it("CA-10: GlobalAdmin com termo pendente e can_accept=false vê o aviso e não é bloqueado", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "GlobalAdmin", token: fakeJwt({}) },
    });
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(false));

    render(<PendingTermsGate />);

    expect(await screen.findByText(GLOBAL_ADMIN_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText("Aguardando aceite do Termo de Contratação")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ir para o portal do cliente/i })).not.toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost/dashboard");
  });

  it("CA-10: usuário comum com can_accept=false segue o fluxo atual (tela de espera, sem aviso)", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "TenantAdmin", token: fakeJwt({}) },
    });
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(false));

    render(<PendingTermsGate />);

    expect(await screen.findByText("Aguardando aceite do Termo de Contratação")).toBeInTheDocument();
    expect(screen.queryByText(GLOBAL_ADMIN_NOTICE)).not.toBeInTheDocument();
  });

  it("GlobalAdmin com can_accept=true segue o fluxo de aceite no portal", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "GlobalAdmin", token: fakeJwt({}) },
    });
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(true));

    render(<PendingTermsGate />);

    expect(await screen.findByRole("button", { name: /ir para o portal do cliente/i })).toBeInTheDocument();
    expect(screen.queryByText(GLOBAL_ADMIN_NOTICE)).not.toBeInTheDocument();
  });

  it("GlobalAdmin não passa quando a consulta de status falha (fail-closed)", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "GlobalAdmin", token: fakeJwt({}) },
    });
    (TermsService.getStatus as any).mockRejectedValue(new Error("Network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<PendingTermsGate />);

    expect(await screen.findByText("Aguardando aceite do Termo de Contratação")).toBeInTheDocument();
    expect(screen.queryByText(GLOBAL_ADMIN_NOTICE)).not.toBeInTheDocument();
  });

  // RF-03: o aviso acompanha a empresa selecionada sem esperar o ciclo de 15 s.
  it("troca do tenant ativo: consulta o novo tenant na hora", async () => {
    sessionStorage.setItem("active-tenant", "tenant-A");
    (TermsService.getStatus as any).mockResolvedValue({ pending: [] });

    render(<PendingTermsGate />);
    await waitFor(() => expect(TermsService.getStatus).toHaveBeenCalledWith("tenant-A"));

    sessionStorage.setItem("active-tenant", "tenant-B");
    act(() => {
      window.dispatchEvent(new CustomEvent("active-tenant-change", { detail: "tenant-B" }));
    });

    await waitFor(() => expect(TermsService.getStatus).toHaveBeenCalledWith("tenant-B"));
  });

  it("resposta de um tenant anterior não sobrescreve a do tenant atual", async () => {
    sessionStorage.setItem("active-tenant", "tenant-A");
    let responderA: (valor: unknown) => void = () => {};
    (TermsService.getStatus as any)
      .mockImplementationOnce(() => new Promise((resolve) => { responderA = resolve; }))
      .mockResolvedValueOnce({ pending: [] });

    const { container } = render(<PendingTermsGate />);
    sessionStorage.setItem("active-tenant", "tenant-B");
    act(() => {
      window.dispatchEvent(new CustomEvent("active-tenant-change", { detail: "tenant-B" }));
    });
    await waitFor(() => expect(TermsService.getStatus).toHaveBeenCalledWith("tenant-B"));

    await act(async () => {
      responderA(pendingContract(false));
    });

    expect(screen.queryByText("Aguardando aceite do Termo de Contratação")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  // RF-04: o GlobalAdmin pode fechar o aviso.
  it("GlobalAdmin fecha o aviso: ele não volta para o mesmo tenant, mas volta para outro tenant pendente", async () => {
    (useAuthStore as any).mockReturnValue({
      logout: mockLogout,
      session: { role: "GlobalAdmin", token: fakeJwt({}) },
    });
    sessionStorage.setItem("active-tenant", "tenant-A");
    (TermsService.getStatus as any).mockResolvedValue(pendingContract(false));

    render(<PendingTermsGate />);
    fireEvent.click(await screen.findByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByText(GLOBAL_ADMIN_NOTICE)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("active-tenant-change", { detail: "tenant-A" }));
    });
    await waitFor(() => expect(TermsService.getStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(GLOBAL_ADMIN_NOTICE)).not.toBeInTheDocument();

    sessionStorage.setItem("active-tenant", "tenant-B");
    act(() => {
      window.dispatchEvent(new CustomEvent("active-tenant-change", { detail: "tenant-B" }));
    });
    expect(await screen.findByText(GLOBAL_ADMIN_NOTICE)).toBeInTheDocument();
  });
});
