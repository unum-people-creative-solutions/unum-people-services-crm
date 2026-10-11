import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("CA-01: pendente no tenant t-2 = redireciona com tenant_id=t-2 e return_to, ambos codificados", async () => {
    sessionStorage.setItem("active-tenant", "t-2");
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
    expect(TermsService.getStatus).toHaveBeenCalledWith("t-2");
    fireEvent.click(ctaButton);

    const target = new URL(window.location.href);
    expect(target.searchParams.get("tenant_id")).toBe("t-2");
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
});
