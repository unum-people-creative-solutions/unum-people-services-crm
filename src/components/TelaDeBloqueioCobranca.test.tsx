import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import TelaDeBloqueioCobranca from "./TelaDeBloqueioCobranca";
import { useAuthStore } from "@/store/authStore";
import { TenantService } from "@/services/api";
import { logoutFromHostedUI } from "@/lib/pkce";
import { ACTIVE_TENANT_CHANGE_EVENT, ACTIVE_TENANT_KEY } from "@/lib/activeTenant";
import type { ResumoDeCobranca } from "@/types/cobranca";
import {
  resumoBloqueado,
  resumoBloqueadoSemFatura,
  resumoBloqueadoSemGerir,
  resumoEmDia,
  resumoForaDoAr,
} from "@/services/__fixtures__/cobranca";

// spec cobranca-e-plano-do-cliente RF2-52 (conteúdo do RF2-42 sem "Minha conta"),
// RF2-33 (espera), BP-T §8.1, §8.3, §8.5 e §15.3 "Bloqueio"/"Liberação".

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  TenantService: {
    listMyTenants: vi.fn(),
  },
}));

vi.mock("@/lib/pkce", () => ({
  logoutFromHostedUI: vi.fn(),
}));

const TITULO = "Acesso bloqueado por fatura em atraso";
const BOLETO = "Já pagou por boleto? A confirmação leva até 3 dias úteis. O acesso volta sozinho quando o pagamento for confirmado.";
const SEM_CONFIRMACAO =
  "Ainda não recebemos a confirmação. Pix e cartão confirmam em poucos minutos. Boleto leva até 3 dias úteis. O acesso volta sozinho quando o pagamento for confirmado.";
const UMA_EMPRESA = [{ id: "t1", nome_negocio: "Padaria Zé" }];
const DUAS_EMPRESAS = [
  { id: "t1", nome_negocio: "Padaria Zé" },
  { id: "t2", nome_negocio: "Doceria Ana" },
];

const mockLogout = vi.fn();

function renderTela(resumo: ResumoDeCobranca | null, recarregar = vi.fn().mockResolvedValue(undefined), tenantId = "t1") {
  const utils = render(<TelaDeBloqueioCobranca tenantId={tenantId} resumo={resumo} recarregar={recarregar} />);
  return { ...utils, recarregar };
}

async function esperarEmpresas() {
  await waitFor(() => expect(TenantService.listMyTenants).toHaveBeenCalledWith("crm"));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_CUSTOMERS_URL", "");
  (useAuthStore as any).mockReturnValue({ logout: mockLogout });
  (TenantService.listMyTenants as any).mockResolvedValue(UMA_EMPRESA);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TelaDeBloqueioCobranca — Suspenso (bloqueado)", () => {
  it("quem gere: título com foco, texto com DD/MM de fora_do_ar_em − 1 dia, valor e vencimento, linha do boleto, Pagar fatura em nova aba e Portal", async () => {
    renderTela(resumoBloqueado);
    await esperarEmpresas();

    const titulo = screen.getByRole("heading", { level: 1, name: TITULO });
    expect(titulo).toHaveFocus();
    expect(
      screen.getByText(
        "Sua página publicada continua no ar até 04/12. Pague a fatura de R$ 39,90, vencida em 05/11, para voltar a usar Páginas, CRM e blog."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(BOLETO)).toBeInTheDocument();

    const pagar = screen.getByRole("link", { name: /Pagar fatura/ });
    expect(pagar).toHaveAttribute("href", "https://www.asaas.com/i/abc");
    expect(pagar).toHaveAttribute("target", "_blank");
    expect(pagar).toHaveAttribute("rel", "noopener noreferrer");
    expect(pagar).toHaveAccessibleName(/abre em nova aba/);
    // BP-T §14 "Nova aba": ícone ExternalLink visível, fora da leitura.
    expect(pagar.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    const portal = screen.getByRole("link", { name: "Ir para o Portal do cliente" });
    expect(portal).toHaveAttribute("href", "https://customer.unumpeople.com.br?tenant_id=t1");
    expect(portal).not.toHaveAttribute("target");

    expect(screen.queryByText("Avise o responsável")).not.toBeInTheDocument();
    // RF2-52: o conteúdo do RF2-42 sem o "Minha conta" do configurador.
    expect(screen.queryByText("Minha conta")).not.toBeInTheDocument();
    // Ela substitui o conteúdo, não é uma caixa que se fecha (BP-T §8.5).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(titulo);
  });

  it("quem não gere: sem link de pagar, \"Avise o responsável\" e o Portal continua", async () => {
    renderTela(resumoBloqueadoSemGerir);
    await esperarEmpresas();

    expect(screen.getByRole("heading", { level: 1, name: TITULO })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pagar fatura/ })).not.toBeInTheDocument();
    expect(screen.getByText("Avise o responsável")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o Portal do cliente" })).toHaveAttribute(
      "href",
      "https://customer.unumpeople.com.br?tenant_id=t1"
    );
  });

  it("sem fatura registrada: texto sem valor com vencida_em e a linha do e-mail com mailto, sem botão de pagar", async () => {
    renderTela(resumoBloqueadoSemFatura);
    await esperarEmpresas();

    expect(
      screen.getByText(
        "Sua página publicada continua no ar até 04/12. Pague a fatura vencida em 05/11 para voltar a usar Páginas, CRM e blog."
      )
    ).toBeInTheDocument();
    const linha = screen.getByText(/Não conseguimos abrir o link da fatura\./);
    expect(linha).toHaveTextContent(
      "Não conseguimos abrir o link da fatura. Escreva para atendimento@unumpeople.com.br que enviamos para você."
    );
    expect(screen.getByRole("link", { name: "atendimento@unumpeople.com.br" })).toHaveAttribute(
      "href",
      "mailto:atendimento@unumpeople.com.br"
    );
    expect(screen.queryByRole("link", { name: /Pagar fatura/ })).not.toBeInTheDocument();
  });

  it("sem fatura e sem gerir: \"Avise o responsável\" no lugar da linha do e-mail", async () => {
    renderTela({ ...resumoBloqueadoSemFatura, pode_gerir: false });
    await esperarEmpresas();

    expect(screen.getByText("Avise o responsável")).toBeInTheDocument();
    expect(screen.queryByText(/Não conseguimos abrir o link da fatura/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pagar fatura/ })).not.toBeInTheDocument();
  });

  it("o URL do Portal vem de NEXT_PUBLIC_CUSTOMERS_URL com o tenant_id da empresa", async () => {
    vi.stubEnv("NEXT_PUBLIC_CUSTOMERS_URL", "https://portal.exemplo.com");
    renderTela(resumoBloqueado, undefined, "TENANT#A B");
    await esperarEmpresas();
    expect(screen.getByRole("link", { name: "Ir para o Portal do cliente" })).toHaveAttribute(
      "href",
      "https://portal.exemplo.com?tenant_id=TENANT%23A%20B"
    );
  });

  it("\"Sair e voltar para o login\" faz logout e volta ao login do Hosted UI", async () => {
    renderTela(resumoBloqueado);
    await esperarEmpresas();
    fireEvent.click(screen.getByRole("button", { name: "Sair e voltar para o login" }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(logoutFromHostedUI).toHaveBeenCalledTimes(1);
  });
});

describe("TelaDeBloqueioCobranca — Pausado (fora_do_ar)", () => {
  it("texto com cancelamento_em, sem \"Pagar fatura\" e só \"Ir para o Portal do cliente\"", async () => {
    renderTela(resumoForaDoAr);
    await esperarEmpresas();

    expect(screen.getByRole("heading", { level: 1, name: TITULO })).toHaveFocus();
    expect(
      screen.getByText(
        "Sua página está fora do ar por falta de pagamento. A conta será cancelada em 04/01. Para reativar, vá ao Portal do cliente."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pagar fatura/ })).not.toBeInTheDocument();
    expect(screen.queryByText(BOLETO)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o Portal do cliente" })).toHaveAttribute(
      "href",
      "https://customer.unumpeople.com.br?tenant_id=t1"
    );
    expect(screen.queryByText("Avise o responsável")).not.toBeInTheDocument();
  });

  it("quem não gere: \"Avise o responsável\" e o Portal", async () => {
    renderTela({ ...resumoForaDoAr, pode_gerir: false });
    await esperarEmpresas();
    expect(screen.getByText("Avise o responsável")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o Portal do cliente" })).toBeInTheDocument();
  });
});

describe("TelaDeBloqueioCobranca — empresas", () => {
  it("com uma empresa não há seletor", async () => {
    renderTela(resumoBloqueado);
    await esperarEmpresas();
    expect(screen.queryByRole("combobox", { name: "Empresa" })).not.toBeInTheDocument();
  });

  it("com duas empresas, o seletor \"Empresa\" grava a empresa ativa no sessionStorage e avisa a troca", async () => {
    (TenantService.listMyTenants as any).mockResolvedValue(DUAS_EMPRESAS);
    const trocas: string[] = [];
    const ouvir = (e: Event) => trocas.push((e as CustomEvent).detail);
    window.addEventListener(ACTIVE_TENANT_CHANGE_EVENT, ouvir);

    renderTela(resumoBloqueado);
    const seletor = await screen.findByRole("combobox", { name: "Empresa" });
    expect(seletor).toHaveValue("t1");
    expect(screen.getByRole("option", { name: "Doceria Ana" })).toBeInTheDocument();

    fireEvent.change(seletor, { target: { value: "t2" } });
    window.removeEventListener(ACTIVE_TENANT_CHANGE_EVENT, ouvir);

    expect(sessionStorage.getItem(ACTIVE_TENANT_KEY)).toBe("t2");
    expect(trocas).toEqual(["t2"]);
  });

  it("falha ao listar as empresas aparece na tela e \"Tentar de novo\" lista de novo", async () => {
    (TenantService.listMyTenants as any).mockRejectedValueOnce(new Error("rede"));
    renderTela(resumoBloqueado);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível carregar a lista de empresas.");
    (TenantService.listMyTenants as any).mockResolvedValue(DUAS_EMPRESAS);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByRole("combobox", { name: "Empresa" })).toBeInTheDocument();
    expect(TenantService.listMyTenants).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("TelaDeBloqueioCobranca — espera do pagamento", () => {
  it("clicar em \"Pagar fatura\" mostra \"Aguardando a confirmação do pagamento\" e o link continua", async () => {
    renderTela(resumoBloqueado);
    await esperarEmpresas();

    fireEvent.click(screen.getByRole("link", { name: /Pagar fatura/ }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Aguardando a confirmação do pagamento");
    expect(status).toHaveTextContent("Pix e cartão costumam confirmar em poucos minutos. Esta tela atualiza sozinha.");
    expect(screen.getByRole("link", { name: /Pagar fatura/ })).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("cobranca-aguardando:t1")!).vencimento).toBe("2026-11-05");
  });

  it("liberação: \"crm\" sai da lista → \"Pagamento confirmado\" com foco, \"Seu acesso está liberado.\" e \"Continuar\" recarrega", async () => {
    const reload = vi.fn();
    const locationOriginal = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...locationOriginal, reload } });

    const { rerender, recarregar } = renderTela(resumoBloqueado);
    await esperarEmpresas();
    fireEvent.click(screen.getByRole("link", { name: /Pagar fatura/ }));

    rerender(<TelaDeBloqueioCobranca tenantId="t1" resumo={resumoEmDia} recarregar={recarregar} />);

    const titulo = screen.getByRole("heading", { level: 1, name: "Pagamento confirmado" });
    expect(titulo).toHaveFocus();
    expect(screen.getByText("Seu acesso está liberado.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: TITULO })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pagar fatura/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", { configurable: true, value: locationOriginal });
  });

  it("parcial (R6): a linha do pagamento recebido aparece acima do texto", async () => {
    sessionStorage.setItem("cobranca-aguardando:t1", JSON.stringify({ clicado_em: Date.now() - 30_000, vencimento: "2026-10-05" }));
    renderTela(resumoBloqueado);
    await esperarEmpresas();

    const linha = screen.getByText("Recebemos o pagamento da fatura de 05/10. Ainda há outra fatura em atraso.");
    const texto = screen.getByText(/Sua página publicada continua no ar até 04\/12\./);
    expect(linha.compareDocumentPosition(texto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Aguardando a confirmação do pagamento")).not.toBeInTheDocument();
  });

  describe("com relógio falso", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function avancar(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it("10 min sem confirmar: mensagem, \"Conferir agora\" consulta e \"Pagar fatura\" continua", async () => {
      const { recarregar } = renderTela(resumoBloqueado);
      await avancar(0);
      fireEvent.click(screen.getByRole("link", { name: /Pagar fatura/ }));
      await avancar(600_000);

      // Região viva, como no Portal (L3 do Verifier F2).
      expect(screen.getByRole("status")).toHaveTextContent(SEM_CONFIRMACAO);
      expect(screen.queryByText("Aguardando a confirmação do pagamento")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Pagar fatura/ })).toBeInTheDocument();

      const antes = recarregar.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Conferir agora" }));
      expect(recarregar).toHaveBeenCalledTimes(antes + 1);
    });

    it("recarregar depois dos 10 min: \"Ainda não recebemos a confirmação…\" na região viva, \"Conferir agora\" e \"Pagar fatura\"", async () => {
      sessionStorage.setItem(
        "cobranca-aguardando:t1",
        JSON.stringify({ clicado_em: Date.now() - 11 * 60_000, vencimento: "2026-11-05" })
      );
      const { recarregar } = renderTela(resumoBloqueado);
      await avancar(0);

      expect(screen.getByRole("status")).toHaveTextContent(SEM_CONFIRMACAO);
      expect(screen.queryByText("Aguardando a confirmação do pagamento")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Pagar fatura/ })).toBeInTheDocument();
      expect(sessionStorage.getItem("cobranca-aguardando:t1")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Conferir agora" }));
      expect(recarregar).toHaveBeenCalledTimes(1);
    });

    it("três consultas seguidas com falha: alerta com \"Conferir agora\"", async () => {
      const recarregar = vi.fn().mockRejectedValue(new Error("rede"));
      renderTela(resumoBloqueado, recarregar);
      await avancar(0);
      fireEvent.click(screen.getByRole("link", { name: /Pagar fatura/ }));
      await avancar(30_000);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      await avancar(15_000);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível conferir o pagamento agora. Tente de novo em instantes."
      );
      fireEvent.click(screen.getByRole("button", { name: "Conferir agora" }));
      expect(recarregar).toHaveBeenCalledTimes(4);
    });
  });
});

describe("TelaDeBloqueioCobranca — 403 antes do resumo chegar", () => {
  it("sem resumo ainda: título com foco, Portal e Sair, sem pagar", async () => {
    renderTela(null);
    await esperarEmpresas();
    expect(screen.getByRole("heading", { level: 1, name: TITULO })).toHaveFocus();
    expect(screen.queryByRole("link", { name: /Pagar fatura/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o Portal do cliente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair e voltar para o login" })).toBeInTheDocument();
  });
});
