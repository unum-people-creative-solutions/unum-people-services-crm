import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LandingPage from "./page";

const mockRedirectToHostedUI = vi.fn();
vi.mock("@/lib/pkce", () => ({
  redirectToHostedUI: (...args: unknown[]) => mockRedirectToHostedUI(...args),
}));

// Mock next/image
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, className }: any) => <img src={src} alt={alt} className={className} />,
}));

describe("LandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders the footer logo without inversion classes (since footer is white)", () => {
    render(<LandingPage />);
    
    const footer = screen.getByRole("contentinfo");
    // In footer we now only have the logo_texto which has alt="Unum People"
    const footerLogo = footer.querySelector('img[alt="Unum People"]');
    
    expect(footerLogo).toBeInTheDocument();
    expect(footerLogo?.className).not.toContain("brightness-0");
    expect(footerLogo?.className).not.toContain("invert");
  });

  // TASK-FE-CRM-003: não existe mais página /login própria do app — os CTAs
  // "Acessar Painel" e "Login" agora acionam o redirect para o Hosted UI.
  it('aciona redirectToHostedUI ao clicar em "Acessar Painel"', () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Acessar Painel" }));

    expect(mockRedirectToHostedUI).toHaveBeenCalledWith("/");
  });

  it("redireciona para o Hosted UI automaticamente quando rodando em modo standalone (PWA/TWA)", async () => {
    (window.matchMedia as any) = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(<LandingPage />);

    await waitFor(() => {
      expect(mockRedirectToHostedUI).toHaveBeenCalledWith("/");
    });
  });

  it('"Começar Agora" leva direto aos planos, sem passar pelo redirecionamento de /servicos', () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: /Começar Agora/ })).toHaveAttribute(
      "href",
      "https://unumpeople.app/#planos",
    );
  });
});
