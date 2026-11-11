"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { TenantService } from "@/services/api";
import { logoutFromHostedUI } from "@/lib/pkce";
import { ACTIVE_TENANT_CHANGE_EVENT, ACTIVE_TENANT_KEY } from "@/lib/activeTenant";
import { diaAnterior, ferramentasCitadas, formatarData, formatarReais } from "@/lib/cobrancaTexto";
import { useEsperaDoPagamento } from "@/hooks/useEsperaDoPagamento";
import type { ResumoDeCobranca } from "@/types/cobranca";

// Tela de bloqueio por fatura em atraso (spec cobranca-e-plano-do-cliente RF2-52;
// conteúdo de BP-T §8.1, desenho de §8.3, foco e teclado de §8.5). Substitui o
// conteúdo do CRM: não é uma caixa que se fecha.

interface Empresa {
  id: string;
  nome_negocio: string;
}

interface Props {
  tenantId: string;
  resumo: ResumoDeCobranca | null;
  recarregar: () => Promise<unknown>;
  // Aviso da UI-4 quando a releitura do resumo falha depois de um 403 (L5).
  aviso?: React.ReactNode;
}

const TITULO = "Acesso bloqueado por fatura em atraso";
const EMAIL_ATENDIMENTO = "atendimento@unumpeople.com.br";

const botaoPrimario =
  "block w-full bg-brand-blue hover:brightness-110 text-white py-3 rounded-xl font-bold transition duration-200";
const botaoSecundario =
  "block w-full border border-gray-300 bg-white text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition duration-200";
const linkSecundario = "text-sm font-semibold text-gray-600 underline hover:text-gray-700";

function urlDoPortal(tenantId: string): string {
  const base = process.env.NEXT_PUBLIC_CUSTOMERS_URL || "https://customer.unumpeople.com.br";
  return `${base}?tenant_id=${encodeURIComponent(tenantId)}`;
}

export default function TelaDeBloqueioCobranca({ tenantId, resumo, recarregar, aviso }: Props) {
  const { logout } = useAuthStore();
  const espera = useEsperaDoPagamento(tenantId, resumo, recarregar);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const confirmado = espera.estado === "confirmado";

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [erroEmpresas, setErroEmpresas] = useState(false);

  const carregarEmpresas = useCallback(() => {
    setErroEmpresas(false);
    TenantService.listMyTenants("crm")
      .then((lista: Empresa[]) => setEmpresas(lista ?? []))
      .catch((err: unknown) => {
        console.error("Erro ao listar as empresas na tela de bloqueio:", err);
        setErroEmpresas(true);
      });
  }, []);

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  // Foco no título ao aparecer e quando ele troca para "Pagamento confirmado".
  useEffect(() => {
    tituloRef.current?.focus();
  }, [confirmado]);

  const trocarEmpresa = (id: string) => {
    sessionStorage.setItem(ACTIVE_TENANT_KEY, id);
    window.dispatchEvent(new CustomEvent(ACTIVE_TENANT_CHANGE_EVENT, { detail: id }));
  };

  const sair = () => {
    logout();
    logoutFromHostedUI();
  };

  const seletorDeEmpresa =
    empresas.length > 1 ? (
      <div className="mb-6 text-left">
        <label htmlFor="empresa-bloqueio" className="block text-sm font-semibold text-gray-700 mb-1">
          Empresa
        </label>
        <select
          id="empresa-bloqueio"
          value={tenantId}
          onChange={(e) => trocarEmpresa(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900"
        >
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>
              {empresa.nome_negocio}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  const avisoEmpresas = erroEmpresas ? (
    <div role="alert" className="mb-6 bg-red-50 border-l-4 border-red-500 p-3 text-left text-sm text-red-800">
      <p>Não foi possível carregar a lista de empresas.</p>
      <button type="button" onClick={carregarEmpresas} className="mt-2 font-semibold underline">
        Tentar de novo
      </button>
    </div>
  ) : null;

  if (confirmado) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
          <h1 ref={tituloRef} tabIndex={-1} className="text-xl font-bold mb-2 text-gray-900 outline-none">
            Pagamento confirmado
          </h1>
          <p className="text-sm text-gray-600 mb-6">Seu acesso está liberado.</p>
          <button type="button" onClick={() => window.location.reload()} className={botaoPrimario}>
            Continuar
          </button>
        </div>
      </main>
    );
  }

  const situacao = resumo?.situacao;
  const fatura = resumo?.fatura ?? null;
  const podeGerir = resumo?.pode_gerir === true;
  const ferramentas = resumo ? ferramentasCitadas(resumo.ferramentas_bloqueadas) : "";
  const linkDaFatura = podeGerir && situacao === "bloqueado" ? fatura?.link : undefined;
  const esperando = espera.estado === "aguardando" || espera.estado === "sem_confirmacao";

  let texto: string | null = null;
  if (situacao === "fora_do_ar" && resumo?.cancelamento_em) {
    texto = `Sua página está fora do ar por falta de pagamento. A conta será cancelada em ${formatarData(resumo.cancelamento_em)}. Para reativar, vá ao Portal do cliente.`;
  } else if (situacao === "bloqueado" && resumo?.fora_do_ar_em) {
    const noArAte = formatarData(diaAnterior(resumo.fora_do_ar_em));
    if (fatura) {
      texto = `Sua página publicada continua no ar até ${noArAte}. Pague a fatura de ${formatarReais(fatura.valor)}, vencida em ${formatarData(fatura.vencimento)}, para voltar a usar ${ferramentas}.`;
    } else if (resumo.vencida_em) {
      texto = `Sua página publicada continua no ar até ${noArAte}. Pague a fatura vencida em ${formatarData(resumo.vencida_em)} para voltar a usar ${ferramentas}.`;
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
        {seletorDeEmpresa}
        {avisoEmpresas}

        <h1 ref={tituloRef} tabIndex={-1} className="text-xl font-bold mb-2 text-gray-900 outline-none">
          {TITULO}
        </h1>

        {aviso}

        {espera.estado === "parcial" && espera.vencimentoPago && (
          <p className="text-sm font-semibold text-gray-900 mb-2">
            Recebemos o pagamento da fatura de {formatarData(espera.vencimentoPago)}. Ainda há outra fatura em atraso.
          </p>
        )}

        {texto && <p className="text-sm text-gray-600 mb-2">{texto}</p>}

        {situacao === "bloqueado" && (
          <p className="text-sm text-gray-600 mb-2">
            Já pagou por boleto? A confirmação leva até 3 dias úteis. O acesso volta sozinho quando o pagamento for
            confirmado.
          </p>
        )}

        {situacao === "bloqueado" && !fatura && podeGerir && (
          <p className="text-sm text-gray-600 mb-2">
            Não conseguimos abrir o link da fatura. Escreva para{" "}
            <a href={`mailto:${EMAIL_ATENDIMENTO}`} className="font-semibold underline">
              {EMAIL_ATENDIMENTO}
            </a>{" "}
            que enviamos para você.
          </p>
        )}

        {resumo && !podeGerir && <p className="text-sm font-semibold text-gray-900 mb-2">Avise o responsável</p>}

        {/* Região viva fixa: anuncia a espera e o desfecho dos 10 min, como no Portal. */}
        <div role="status">
          {espera.estado === "aguardando" && (
            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              <p className="font-bold text-gray-900">Aguardando a confirmação do pagamento</p>
              <p>Pix e cartão costumam confirmar em poucos minutos. Esta tela atualiza sozinha.</p>
            </div>
          )}

          {espera.estado === "sem_confirmacao" && (
            <p className="mt-4 text-sm text-gray-700">
              Ainda não recebemos a confirmação. Pix e cartão confirmam em poucos minutos. Boleto leva até 3 dias úteis.
              O acesso volta sozinho quando o pagamento for confirmado.
            </p>
          )}
        </div>

        {espera.falhou && (
          <p role="alert" className="mt-4 bg-red-50 border-l-4 border-red-500 p-3 text-left text-sm text-red-800">
            Não foi possível conferir o pagamento agora. Tente de novo em instantes.
          </p>
        )}

        {(espera.estado === "sem_confirmacao" || espera.falhou) && (
          <button type="button" onClick={espera.conferirAgora} className={`${botaoSecundario} mt-3`}>
            Conferir agora
          </button>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {linkDaFatura && fatura && (
            <a
              href={linkDaFatura}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => espera.iniciar(fatura.vencimento)}
              className={esperando ? botaoSecundario : botaoPrimario}
            >
              <span className="inline-flex items-center justify-center gap-2">
                Pagar fatura <ExternalLink size={16} aria-hidden="true" />
              </span>
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          )}
          <a
            href={urlDoPortal(tenantId)}
            className={!linkDaFatura && podeGerir ? botaoPrimario : linkSecundario}
          >
            Ir para o Portal do cliente
          </a>
          <button type="button" onClick={sair} className={`${linkSecundario} mt-2 block mx-auto`}>
            Sair e voltar para o login
          </button>
        </div>
      </div>
    </main>
  );
}
