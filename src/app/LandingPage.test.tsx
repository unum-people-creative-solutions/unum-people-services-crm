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

  // campanha-pagina RF-C06: os outros dois sinais de app instalado.
  it("redireciona quando o iOS diz que está na tela de início (navigator.standalone)", async () => {
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    try {
      render(<LandingPage />);
      await waitFor(() => expect(mockRedirectToHostedUI).toHaveBeenCalledWith("/"));
    } finally {
      delete (window.navigator as any).standalone;
    }
  });

  it("redireciona quando abre pelo app Android (referrer android-app://)", async () => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "referrer");
    Object.defineProperty(document, "referrer", { value: "android-app://br.com.unumpeople.crm/", configurable: true });
    try {
      render(<LandingPage />);
      await waitFor(() => expect(mockRedirectToHostedUI).toHaveBeenCalledWith("/"));
    } finally {
      delete (document as any).referrer;
      if (original) Object.defineProperty(Document.prototype, "referrer", original);
    }
  });

  // campanha-pagina RF-C06, caso negativo: no Safari do iPhone fora da tela de
  // início `navigator.standalone` existe e vale false; a home pública continua.
  it("não redireciona num navegador comum, mesmo com navigator.standalone = false", async () => {
    Object.defineProperty(window.navigator, "standalone", { value: false, configurable: true });
    try {
      render(<LandingPage />);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockRedirectToHostedUI).not.toHaveBeenCalled();
    } finally {
      delete (window.navigator as any).standalone;
    }
  });
});
