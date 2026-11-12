"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Trash2 } from "lucide-react";
import { leadSchema } from "@/lib/validations";
import { paraUTC, partesEmBrasilia } from "@/lib/agendamento";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { CPFInput } from "@/components/ui/CPFInput";
import { StatusAdsDaVenda } from "@/components/StatusAdsDaVenda";
import {
  InteracaoService,
  LeadService,
  MENSAGEM_SEM_PERMISSAO,
  mensagemDeErro,
  type Interacao,
  type LeadSale,
  type TipoDeInteracao,
} from "@/services/api";

// Gaveta da ficha (INT-12 a INT-14). O horário digitado usa o mesmo -03:00
// de paraUTC: é Brasília, não o fuso do aparelho.

const TIPOS: { valor: TipoDeInteracao; rotulo: string }[] = [
  { valor: "nota", rotulo: "Nota" },
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "reuniao", rotulo: "Reunião" },
];

const ROTULO: Record<string, string> = Object.fromEntries(TIPOS.map((tipo) => [tipo.valor, tipo.rotulo]));

const ORIGENS = ["Indicação", "WhatsApp", "Instagram", "Facebook", "Outro"];

const esquemaDados = leadSchema.omit({ anotacoes: true });
type Dados = z.infer<typeof esquemaDados>;

const MSG_TIPO = "Escolha um tipo: Nota, Ligação, WhatsApp, E-mail ou Reunião.";
const MSG_TEXTO = "Escreva um texto com até 5.000 caracteres.";
const MSG_DATA = "A data tem de ser de até 1 ano atrás, e não pode ser no futuro.";
const MSG_AUTOR = "Só quem registrou pode editar ou apagar.";
const MSG_LEAD = "Este lead não foi encontrado.";
const MSG_ACAO = "Não foi possível concluir. Tente de novo.";
const MSG_LISTA = "Não foi possível carregar o histórico.";
const MSG_PARCIAL = "Informe a data e a hora, ou deixe as duas em branco.";
const MSG_DADOS = "Não foi possível salvar os dados do lead.";

function mensagemDaInteracao(err: unknown, aoListar: boolean): string {
  const response = (err as { response?: { status?: number; data?: { error?: string; motivo?: string; permissao?: unknown } } } | null)?.response;
  const data = response?.data;
  if (response?.status === 403 && typeof data?.permissao === "string" && data.permissao.length > 0) {
    return MENSAGEM_SEM_PERMISSAO;
  }
  if (data?.error === "interacao_invalida") {
    if (data.motivo === "tipo") return MSG_TIPO;
    if (data.motivo === "texto") return MSG_TEXTO;
    if (data.motivo === "data") return MSG_DATA;
  }
  if (data?.error === "nao_e_o_autor") return MSG_AUTOR;
  if (data?.error === "lead_nao_encontrado") return MSG_LEAD;
  return aoListar ? MSG_LISTA : MSG_ACAO;
}

function formatarOcorrida(iso: string): string {
  if (Number.isNaN(Date.parse(iso))) return iso;
  const { data, hora } = partesEmBrasilia(iso);
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano} às ${hora}`;
}

function porRecencia(itens: Interacao[]): Interacao[] {
  return itens.toSorted((a, b) => Date.parse(b.ocorrida_em) - Date.parse(a.ocorrida_em));
}

function ocorridaDigitada(data: string, hora: string): string | "incompleta" | undefined {
  if (!data && !hora) return undefined;
  if (!data || !hora) return "incompleta";
  return paraUTC(data, hora);
}

export interface FichaLead {
  id: string;
  nome: string;
  email?: string;
  telefone: string;
  cpf?: string;
  data_nascimento?: string;
  origem?: string;
  source?: string;
  status?: string;
  sales?: LeadSale[];
}

export interface FichaDoLeadProps {
  lead: FichaLead;
  tenantId: string;
  emailDaSessao: string;
  podeEditar: boolean;
  podeExcluir: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  onExcluir: () => void;
  onRegistrarVenda: () => void;
}

export function FichaDoLead({
  lead,
  tenantId,
  emailDaSessao,
  podeEditar,
  podeExcluir,
  onFechar,
  onSalvo,
  onExcluir,
  onRegistrarVenda,
}: FichaDoLeadProps) {
  const base = useId();
  const idTitulo = `${base}-titulo`;
  const idAbaDados = `${base}-aba-dados`;
  const idAbaHistorico = `${base}-aba-historico`;
  const idPainelDados = `${base}-painel-dados`;
  const idPainelHistorico = `${base}-painel-historico`;
  const [aba, setAba] = useState<"dados" | "historico">("dados");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 text-gray-900" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") onFechar();
        }}
        className="flex h-full w-full max-w-full flex-col bg-white shadow-xl md:max-w-md"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <h2 id={idTitulo} className="text-lg font-bold">Ficha do lead</h2>
          <div className="flex items-center gap-2">
            {podeExcluir && (
              <button
                type="button"
                onClick={onExcluir}
                className="rounded-full p-2 text-red-500 hover:bg-red-50"
                aria-label="Excluir lead"
              >
                <Trash2 size={20} aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2 text-gray-500 hover:text-gray-800">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Ficha" className="flex shrink-0 gap-4 border-b px-6">
          <button
            type="button"
            role="tab"
            id={idAbaDados}
            aria-selected={aba === "dados"}
            aria-controls={idPainelDados}
            onClick={() => setAba("dados")}
            className={`py-3 text-sm font-bold ${aba === "dados" ? "border-b-2 border-brand-blue text-brand-blue" : "text-gray-500"}`}
          >
            Dados
          </button>
          <button
            type="button"
            role="tab"
            id={idAbaHistorico}
            aria-selected={aba === "historico"}
            aria-controls={idPainelHistorico}
            onClick={() => setAba("historico")}
            className={`py-3 text-sm font-bold ${aba === "historico" ? "border-b-2 border-brand-blue text-brand-blue" : "text-gray-500"}`}
          >
            Histórico
          </button>
        </div>

        <AbaDados
          id={idPainelDados}
          rotuloId={idAbaDados}
          oculta={aba !== "dados"}
          lead={lead}
          tenantId={tenantId}
          podeEditar={podeEditar}
          onSalvo={onSalvo}
          onFechar={onFechar}
          onRegistrarVenda={onRegistrarVenda}
        />
        <AbaHistorico
          id={idPainelHistorico}
          rotuloId={idAbaHistorico}
          ativa={aba === "historico"}
          leadId={lead.id}
          tenantId={tenantId}
          emailDaSessao={emailDaSessao}
          podeEditar={podeEditar}
        />
      </div>
    </div>
  );
}

function AbaDados({
  id,
  rotuloId,
  oculta,
  lead,
  tenantId,
  podeEditar,
  onSalvo,
  onFechar,
  onRegistrarVenda,
}: {
  id: string;
  rotuloId: string;
  oculta: boolean;
  lead: FichaLead;
  tenantId: string;
  podeEditar: boolean;
  onSalvo: () => void;
  onFechar: () => void;
  onRegistrarVenda: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const gravando = useRef(false);
  const form = useForm<Dados>({
    resolver: zodResolver(esquemaDados) as Resolver<Dados>,
    defaultValues: {
      nome: lead.nome,
      email: lead.email || "",
      telefone: lead.telefone,
      cpf: lead.cpf || "",
      data_nascimento: lead.data_nascimento || "",
      origem: lead.origem || "",
    },
  });
  const origemTravada = lead.source === "LANDING_PAGE";

  const salvar = async (data: Dados) => {
    if (!podeEditar || gravando.current) return;
    gravando.current = true;
    setSalvando(true);
    setErro(null);
    try {
      await LeadService.update(lead.id, {
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        data_nascimento: data.data_nascimento,
        origem: data.origem,
      }, tenantId);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, MSG_DADOS));
    } finally {
      gravando.current = false;
      setSalvando(false);
    }
  };

  return (
    <div role="tabpanel" id={id} aria-labelledby={rotuloId} hidden={oculta} className="flex-1 overflow-y-auto px-6 py-4">
      {erro && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
      <form onSubmit={form.handleSubmit(salvar)} noValidate className="space-y-4">
        <fieldset disabled={!podeEditar} className="space-y-4">
          <Input label="Nome" {...form.register("nome")} error={form.formState.errors.nome?.message} />
          <Input label="E-mail" type="email" {...form.register("email")} error={form.formState.errors.email?.message} />
          <Controller
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <CPFInput label="CPF" {...field} error={form.formState.errors.cpf?.message} placeholder="000.000.000-00" />
            )}
          />
          <Input label="Data de Nascimento" type="date" {...form.register("data_nascimento")} error={form.formState.errors.data_nascimento?.message} />
          <Controller
            control={form.control}
            name="telefone"
            render={({ field }) => (
              <PhoneInput label="WhatsApp" {...field} error={form.formState.errors.telefone?.message} placeholder="(00) 00000-0000" />
            )}
          />
          <div>
            <label htmlFor={`${id}-origem`} className="text-xs font-bold uppercase text-gray-500">Origem</label>
            {origemTravada ? (
              <div className="mt-1 rounded-md border bg-gray-50 p-2 text-gray-500">
                <p>{form.getValues("origem")}</p>
                <p className="mt-1 text-[10px] font-medium text-amber-600">Leads vindos do site não podem ter a origem alterada.</p>
              </div>
            ) : (
              <select
                id={`${id}-origem`}
                {...form.register("origem")}
                className="mt-1 w-full rounded-md border bg-white p-2 outline-none focus:ring-2 focus:ring-brand-blue"
              >
                {ORIGENS.map((origem) => <option key={origem} value={origem}>{origem}</option>)}
              </select>
            )}
            {form.formState.errors.origem && <p className="mt-1 text-xs text-red-500">{form.formState.errors.origem.message}</p>}
          </div>
        </fieldset>

        <VendasDoMes lead={lead} podeEditar={podeEditar} onRegistrarVenda={onRegistrarVenda} />

        <div className="flex gap-3">
          <button type="button" onClick={onFechar} className="flex-1 rounded-md bg-gray-100 p-3 font-bold">Cancelar</button>
          {podeEditar && (
            <button type="submit" disabled={salvando} className="flex-1 rounded-md bg-brand-orange p-3 font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              Salvar Alterações
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function VendasDoMes({ lead, podeEditar, onRegistrarVenda }: { lead: FichaLead; podeEditar: boolean; onRegistrarVenda: () => void }) {
  const vendas = lead.sales ?? [];
  return (
    <div className="border-t pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase text-gray-700">Vendas do mês</h3>
        {podeEditar && lead.status === "GANHO" && (
          <button
            type="button"
            aria-label="Registrar venda"
            onClick={onRegistrarVenda}
            className="rounded border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-black text-green-700"
          >
            $ +
          </button>
        )}
      </div>
      <div className="space-y-2">
        {vendas.length > 0 ? vendas.map((venda) => (
          <div key={venda.id} className="rounded-md border bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400">{dataDaVenda(venda.data)}</span>
              <span className="font-black text-green-700">{formatarReais(venda.valor)}</span>
            </div>
            <StatusAdsDaVenda ads={venda.ads} motivo={venda.ads_motivo} />
          </div>
        )) : <p className="py-4 text-center text-xs italic text-gray-400">Nenhuma venda registrada.</p>}
      </div>
    </div>
  );
}

function dataDaVenda(valor: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
}

function formatarReais(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function AbaHistorico({
  id,
  rotuloId,
  ativa,
  leadId,
  tenantId,
  emailDaSessao,
  podeEditar,
}: {
  id: string;
  rotuloId: string;
  ativa: boolean;
  leadId: string;
  tenantId: string;
  emailDaSessao: string;
  podeEditar: boolean;
}) {
  const pedido = useRef(0);
  const [itens, setItens] = useState<Interacao[]>([]);
  const [cursor, setCursor] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoDeInteracao>("nota");
  const [texto, setTexto] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [dataEditada, setDataEditada] = useState("");
  const [horaEditada, setHoraEditada] = useState("");
  const enviando = useRef(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!ativa) return;
    const atual = ++pedido.current;
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    InteracaoService.listar(leadId, tenantId)
      .then((pagina) => {
        if (cancelado || atual !== pedido.current) return;
        setItens(porRecencia(pagina.itens));
        setCursor(pagina.cursor || "");
      })
      .catch((err) => {
        if (cancelado || atual !== pedido.current) return;
        setErro(mensagemDaInteracao(err, true));
      })
      .finally(() => {
        if (!cancelado && atual === pedido.current) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [ativa, leadId, tenantId]);

  const carregarMais = async () => {
    if (!cursor || enviando.current) return;
    enviando.current = true;
    setCarregandoMais(true);
    setErro(null);
    try {
      const pagina = await InteracaoService.listar(leadId, tenantId, cursor);
      setItens((atual) => porRecencia([...atual, ...pagina.itens]));
      setCursor(pagina.cursor || "");
    } catch (err) {
      setErro(mensagemDaInteracao(err, true));
    } finally {
      enviando.current = false;
      setCarregandoMais(false);
    }
  };

  const registrar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!podeEditar || enviando.current) return;
    const ocorrida = ocorridaDigitada(data, hora);
    if (ocorrida === "incompleta") {
      setErro(MSG_PARCIAL);
      return;
    }
    enviando.current = true;
    setOcupado(true);
    setErro(null);
    try {
      const criada = await InteracaoService.criar(leadId, tenantId, {
        tipo,
        texto,
        ...(ocorrida ? { ocorrida_em: ocorrida } : {}),
      });
      setItens((atual) => porRecencia([criada, ...atual.filter((item) => item.id !== criada.id)]));
      setTipo("nota");
      setTexto("");
      setData("");
      setHora("");
    } catch (err) {
      setErro(mensagemDaInteracao(err, false));
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  };

  const comecarEdicao = (item: Interacao) => {
    const partes = partesEmBrasilia(item.ocorrida_em);
    setEditandoId(item.id);
    setTextoEditado(item.texto);
    setDataEditada(partes.data);
    setHoraEditada(partes.hora);
    setErro(null);
  };

  const salvarEdicao = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!editandoId || enviando.current) return;
    const ocorrida = ocorridaDigitada(dataEditada, horaEditada);
    if (ocorrida === "incompleta" || !ocorrida) {
      setErro(MSG_PARCIAL);
      return;
    }
    enviando.current = true;
    setOcupado(true);
    setErro(null);
    try {
      await InteracaoService.alterar(leadId, editandoId, tenantId, { texto: textoEditado, ocorrida_em: ocorrida });
      const id = editandoId;
      setItens((atual) => porRecencia(atual.map((item) => (
        item.id === id ? { ...item, texto: textoEditado, ocorrida_em: ocorrida } : item
      ))));
      setEditandoId(null);
    } catch (err) {
      setErro(mensagemDaInteracao(err, false));
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  };

  const apagar = async (item: Interacao) => {
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setErro(null);
    try {
      await InteracaoService.apagar(leadId, item.id, tenantId);
      setItens((atual) => atual.filter((outro) => outro.id !== item.id));
      if (editandoId === item.id) setEditandoId(null);
    } catch (err) {
      setErro(mensagemDaInteracao(err, false));
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  };

  const podeMexer = (autorEmail: string) => podeEditar && autorEmail !== "" && autorEmail === emailDaSessao;

  return (
    <div role="tabpanel" id={id} aria-labelledby={rotuloId} hidden={!ativa} className="flex-1 overflow-y-auto px-6 py-4">
      {erro && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</p>}
      {podeEditar && (
        <form aria-label="Nova interação" onSubmit={registrar} hidden={editandoId !== null} className="mb-6 space-y-3">
          <CamposDaOcorrencia
            tipo={tipo}
            onTipo={setTipo}
            texto={texto}
            onTexto={setTexto}
            data={data}
            onData={setData}
            hora={hora}
            onHora={setHora}
            mostrarTipo
          />
          <button type="submit" disabled={ocupado} className="w-full rounded-md bg-brand-blue p-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            Registrar
          </button>
        </form>
      )}

      {carregando && itens.length === 0 && <p>Carregando histórico…</p>}
      {!carregando && itens.length === 0 && !erro && <p className="py-4 text-center text-sm italic text-gray-400">Nenhuma interação registrada.</p>}

      <div className="space-y-3">
        {itens.map((item) => {
          const autor = item.autor_nome || item.autor_email || "Sem autor";
          const rotulo = ROTULO[item.tipo] ?? item.tipo;
          const editando = editandoId === item.id;
          return (
            <article key={item.id} aria-label={`${rotulo} de ${autor}`} className="rounded-md border p-3">
              <p className="text-xs font-bold uppercase text-gray-500">{rotulo}</p>
              <p className="text-sm font-bold">{autor}</p>
              {editando ? (
                <form aria-label="Editar interação" onSubmit={salvarEdicao} className="mt-2 space-y-3">
                  <CamposDaOcorrencia
                    texto={textoEditado}
                    onTexto={setTextoEditado}
                    data={dataEditada}
                    onData={setDataEditada}
                    hora={horaEditada}
                    onHora={setHoraEditada}
                    mostrarTipo={false}
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={ocupado} className="flex-1 rounded-md bg-brand-blue p-2 text-sm font-bold text-white disabled:opacity-50">Salvar interação</button>
                    <button type="button" onClick={() => setEditandoId(null)} className="flex-1 rounded-md bg-gray-100 p-2 text-sm font-bold">Cancelar edição</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-sm text-gray-600">{formatarOcorrida(item.ocorrida_em)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{item.texto}</p>
                  {podeMexer(item.autor_email) && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => comecarEdicao(item)} disabled={ocupado} className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-bold">Editar</button>
                      <button type="button" onClick={() => apagar(item)} disabled={ocupado} className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700">Apagar</button>
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>

      {cursor !== "" && (
        <button type="button" onClick={carregarMais} disabled={carregandoMais} className="mt-4 w-full rounded-md border p-3 text-sm font-bold disabled:opacity-50">
          Carregar mais
        </button>
      )}
    </div>
  );
}

function CamposDaOcorrencia({
  tipo,
  onTipo,
  texto,
  onTexto,
  data,
  onData,
  hora,
  onHora,
  mostrarTipo,
}: {
  tipo?: TipoDeInteracao;
  onTipo?: (tipo: TipoDeInteracao) => void;
  texto: string;
  onTexto: (texto: string) => void;
  data: string;
  onData: (data: string) => void;
  hora: string;
  onHora: (hora: string) => void;
  mostrarTipo: boolean;
}) {
  const base = useId();
  return (
    <>
      {mostrarTipo && onTipo && (
        <div>
          <label htmlFor={`${base}-tipo`} className="text-xs font-bold uppercase text-gray-500">Tipo</label>
          <select
            id={`${base}-tipo`}
            value={tipo}
            onChange={(evento) => onTipo(evento.target.value as TipoDeInteracao)}
            className="mt-1 w-full rounded-md border bg-white p-2 outline-none focus:ring-2 focus:ring-brand-blue"
          >
            {TIPOS.map((opcao) => <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`${base}-texto`} className="text-xs font-bold uppercase text-gray-500">Texto</label>
        <textarea
          id={`${base}-texto`}
          value={texto}
          maxLength={5000}
          onChange={(evento) => onTexto(evento.target.value)}
          className="mt-1 min-h-[100px] w-full rounded-md border p-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${base}-data`} className="text-xs font-bold uppercase text-gray-500">Data</label>
          <input
            id={`${base}-data`}
            type="date"
            value={data}
            onChange={(evento) => onData(evento.target.value)}
            className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
        <div>
          <label htmlFor={`${base}-hora`} className="text-xs font-bold uppercase text-gray-500">Hora</label>
          <input
            id={`${base}-hora`}
            type="time"
            value={hora}
            onChange={(evento) => onHora(evento.target.value)}
            className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">Horário de Brasília.</p>
    </>
  );
}
