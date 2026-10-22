"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { ExternalLink, Megaphone, Save } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { getGoogleAdsAuthUrl } from "@/lib/google-ads";
import {
  AdsConfigService,
  mensagemDeErro,
  type AdsConfig,
  type AdsConfigInput,
} from "@/services/api";

const MENSAGEM_ID_CONTA = "Use o formato 000-000-0000.";
const MENSAGEM_ACAO = "Use só números (até 20 dígitos).";
const ID_CONTA_RE = /^\d{3}-\d{3}-\d{4}$/;
const ACAO_RE = /^\d{1,20}$/;

type CampoAds =
  | "google_ads_customer_id"
  | "ads_conversion_action_id"
  | "ads_recurring_conversion_action_id";

type ErrosCampos = Partial<Record<CampoAds, string>>;

const ORDEM_CAMPOS: CampoAds[] = [
  "google_ads_customer_id",
  "ads_conversion_action_id",
  "ads_recurring_conversion_action_id",
];

function mensagemDoCampo(campo: CampoAds): string {
  return campo === "google_ads_customer_id" ? MENSAGEM_ID_CONTA : MENSAGEM_ACAO;
}

function validar(valores: AdsConfigInput): ErrosCampos {
  const erros: ErrosCampos = {};

  if (valores.google_ads_customer_id !== "" && !ID_CONTA_RE.test(valores.google_ads_customer_id)) {
    erros.google_ads_customer_id = MENSAGEM_ID_CONTA;
  }
  if (valores.ads_conversion_action_id !== "" && !ACAO_RE.test(valores.ads_conversion_action_id)) {
    erros.ads_conversion_action_id = MENSAGEM_ACAO;
  }
  if (
    valores.ads_recurring_conversion_action_id !== "" &&
    !ACAO_RE.test(valores.ads_recurring_conversion_action_id)
  ) {
    erros.ads_recurring_conversion_action_id = MENSAGEM_ACAO;
  }

  return erros;
}

function erroCampoInvalido(
  err: unknown,
): { invalidField: true; campo: CampoAds | null } | { invalidField: false } {
  const response = (
    err as {
      response?: { status?: number; data?: { error?: unknown; field?: unknown } };
    } | null
  )?.response;

  if (response?.status !== 400 || response.data?.error !== "invalid_field") {
    return { invalidField: false };
  }

  const campo = response.data?.field;
  if (
    campo === "google_ads_customer_id" ||
    campo === "ads_conversion_action_id" ||
    campo === "ads_recurring_conversion_action_id"
  ) {
    return { invalidField: true, campo };
  }

  // Campo que a tela não conhece: cai no alerta padrão, nunca fica mudo.
  return { invalidField: false };
}

function CampoTexto({
  id,
  label,
  value,
  placeholder,
  error,
  inputRef,
  onValueChange,
}: {
  id: CampoAds;
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  inputRef: RefObject<HTMLInputElement>;
  onValueChange: (value: string) => void;
}) {
  const errorId = `erro-${id}`;

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-gray-500 uppercase mb-1">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onValueChange(event.target.value)}
        className={`w-full p-3 bg-gray-50 rounded-lg border font-medium text-gray-700 outline-none focus:border-brand-blue ${
          error ? "border-red-500" : "border-gray-100"
        }`}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function TabGoogleAds() {
  const { activeTenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [config, setConfig] = useState<AdsConfig | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [saleActionId, setSaleActionId] = useState("");
  const [recurringActionId, setRecurringActionId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ErrosCampos>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const customerIdRef = useRef<HTMLInputElement>(null);
  const saleActionRef = useRef<HTMLInputElement>(null);
  const recurringActionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeTenantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setConfig(null);
    setSaved(false);
    setSaveError(null);
    setFieldErrors({});

    AdsConfigService.get(activeTenantId)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setCustomerId(data.google_ads_customer_id ?? "");
        setSaleActionId(data.ads_conversion_action_id ?? "");
        setRecurringActionId(data.ads_recurring_conversion_action_id ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTenantId]);

  function limparErro(campo: CampoAds) {
    setFieldErrors((atual) => {
      if (!atual[campo]) return atual;
      const proximo = { ...atual };
      delete proximo[campo];
      return proximo;
    });
  }

  function focarCampo(campo: CampoAds) {
    const ref =
      campo === "google_ads_customer_id"
        ? customerIdRef
        : campo === "ads_conversion_action_id"
          ? saleActionRef
          : recurringActionRef;
    ref.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTenantId || savingRef.current) return;

    const payload: AdsConfigInput = {
      google_ads_customer_id: customerId.trim(),
      ads_conversion_action_id: saleActionId.trim(),
      ads_recurring_conversion_action_id: recurringActionId.trim(),
    };
    const erros = validar(payload);

    if (ORDEM_CAMPOS.some((campo) => erros[campo])) {
      setFieldErrors(erros);
      setSaveError(null);
      setSaved(false);
      const primeiro = ORDEM_CAMPOS.find((campo) => erros[campo]);
      if (primeiro) focarCampo(primeiro);
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setSaved(false);
    savingRef.current = true;
    setSaving(true);

    try {
      const atualizado = await AdsConfigService.update(activeTenantId, payload);
      setConfig(atualizado);
      setCustomerId(atualizado.google_ads_customer_id ?? "");
      setSaleActionId(atualizado.ads_conversion_action_id ?? "");
      setRecurringActionId(atualizado.ads_recurring_conversion_action_id ?? "");
      setSaved(true);
    } catch (err) {
      const invalido = erroCampoInvalido(err);
      if (invalido.invalidField) {
        if (invalido.campo) {
          setFieldErrors({ [invalido.campo]: mensagemDoCampo(invalido.campo) });
          focarCampo(invalido.campo);
        }
        return;
      }
      setSaveError(mensagemDeErro(err, "Não foi possível salvar a configuração do Google Ads."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  let conteudo;
  if (loading) {
    conteudo = <p className="text-sm text-gray-500">Carregando configuração do Google Ads…</p>;
  } else if (loadError) {
    conteudo = (
      <p role="alert" className="text-sm text-red-600">
        Não foi possível carregar a configuração do Google Ads. Recarregue a página para tentar de novo.
      </p>
    );
  } else if (!config || !activeTenantId) {
    conteudo = null;
  } else {
    conteudo = (
      <>
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
          <Megaphone size={16} aria-hidden="true" />
          Google Ads
        </h2>

        <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 mb-6">
          <p className={`font-bold ${config.conectado ? "text-green-700" : "text-gray-700"}`}>
            {config.conectado ? "Conectado" : "Não conectado"}
          </p>
          <a
            href={getGoogleAdsAuthUrl(activeTenantId)}
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Conectar Google Ads
          </a>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <CampoTexto
            id="google_ads_customer_id"
            label="ID da conta"
            value={customerId}
            placeholder="000-000-0000"
            error={fieldErrors.google_ads_customer_id}
            inputRef={customerIdRef}
            onValueChange={(value) => {
              setCustomerId(value);
              limparErro("google_ads_customer_id");
            }}
          />
          <CampoTexto
            id="ads_conversion_action_id"
            label="Ação de venda"
            value={saleActionId}
            error={fieldErrors.ads_conversion_action_id}
            inputRef={saleActionRef}
            onValueChange={(value) => {
              setSaleActionId(value);
              limparErro("ads_conversion_action_id");
            }}
          />
          <CampoTexto
            id="ads_recurring_conversion_action_id"
            label="Ação de recorrência (opcional)"
            value={recurringActionId}
            error={fieldErrors.ads_recurring_conversion_action_id}
            inputRef={recurringActionRef}
            onValueChange={(value) => {
              setRecurringActionId(value);
              limparErro("ads_recurring_conversion_action_id");
            }}
          />

          <div className="space-y-3 text-sm text-gray-600">
            <p>
              Quando um cliente que chegou por um anúncio do Google compra, a venda registrada aqui é enviada ao Google Ads, com o valor.
            </p>
            <p>
              <strong>Ação de venda:</strong> recebe as vendas.
            </p>
            <p>
              <strong>Ação de recorrência (opcional):</strong> se preenchida, recebe as compras que vierem depois da primeira de cada cliente (recompra, mensalidade). Em branco, todas as vendas vão para a Ação de venda.
            </p>
            <p>Sem a Ação de venda, nenhuma venda é enviada.</p>
            <p>
              Onde achar o número: no Google Ads, em Metas › Conversões, abra a ação e copie o número que aparece depois de ctId= no endereço. A ação deve ser de importação de conversões de cliques, com janela de 90 dias. Se ela deve orientar os lances, marque-a como principal no próprio Google Ads.
            </p>
            <p>
              O Google só aceita vendas feitas até 90 dias depois do clique no anúncio. Vendas mais tardias ficam no CRM, mas não são enviadas.
            </p>
          </div>

          {saved ? (
            <p role="status" className="text-sm font-bold text-green-700">
              Configuração salva.
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} aria-hidden="true" />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">{conteudo}</section>
    </div>
  );
}
