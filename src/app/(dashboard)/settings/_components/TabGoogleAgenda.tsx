"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Save } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { prepararConexaoGoogleAgenda } from "@/lib/google-agenda";
import {
  GoogleAgendaService,
  mensagemDeErro,
  type AgendaGoogle,
  type ConexaoGoogleAgenda,
  type SituacaoGoogleAgenda,
} from "@/services/api";

// Aba "Google Agenda" das Configurações (spec crm-google-agenda RF-19, RF-20).
// A tela esconde, mas quem decide é a API (403 sem crm.integracoes.gerir).

const botaoPrincipal =
  "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed";
const botaoSecundario =
  "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed";

// O item pode guardar "primary" (sem a lista ao conectar, ou conexão antiga); o RF-03
// devolve a principal com o id real dela, que é o que vai no "Salvar" (RF-19a).
function agendaEscolhida(conexao: ConexaoGoogleAgenda, lista: AgendaGoogle[]): string {
  if (lista.some((a) => a.id === conexao.agenda_id)) return conexao.agenda_id;
  if (conexao.agenda_id === "primary") return lista.find((a) => a.principal)?.id ?? conexao.agenda_id;
  return conexao.agenda_id;
}

export default function TabGoogleAgenda() {
  const { activeTenantId } = useTenant();
  const [situacao, setSituacao] = useState<SituacaoGoogleAgenda | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [agendas, setAgendas] = useState<AgendaGoogle[]>([]);
  const [erroAgendas, setErroAgendas] = useState(false);
  const [agendaId, setAgendaId] = useState("");
  const [duracao, setDuracao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [erroDesconectar, setErroDesconectar] = useState<string | null>(null);
  const salvandoRef = useRef(false);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelado = false;
    setSituacao(null);
    setErroCarga(false);
    setAgendas([]);
    setErroAgendas(false);

    GoogleAgendaService.situacao(activeTenantId)
      .then((dados) => {
        if (cancelado) return;
        setSituacao(dados);
        if (!dados.conectada) return;
        setAgendaId(dados.agenda_id);
        setDuracao(String(dados.duracao_padrao_min));
        // Caída: o token não vale, a lista falharia.
        if (dados.situacao !== "ativa") return;
        GoogleAgendaService.agendas(activeTenantId)
          .then((lista) => {
            if (cancelado) return;
            setAgendas(lista);
            setAgendaId(agendaEscolhida(dados, lista));
          })
          .catch((err) => {
            console.error("Falha ao listar as agendas do Google", err);
            if (!cancelado) setErroAgendas(true);
          });
      })
      .catch((err) => {
        console.error("Falha ao ler o Google Agenda", err);
        if (!cancelado) setErroCarga(true);
      });

    return () => {
      cancelado = true;
    };
  }, [activeTenantId]);

  const conectar = () => {
    if (!activeTenantId) return;
    window.location.assign(prepararConexaoGoogleAgenda(activeTenantId));
  };

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTenantId || salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    setSalvo(false);
    setErroSalvar(null);
    try {
      const atualizada = await GoogleAgendaService.configurar(activeTenantId, {
        agenda_id: agendaId,
        duracao_padrao_min: Number(duracao),
      });
      setSituacao(atualizada);
      setSalvo(true);
    } catch (err) {
      console.error("Falha ao salvar o Google Agenda", err);
      setErroSalvar(mensagemDeErro(err, "Não foi possível salvar. Tente de novo."));
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  async function desconectar() {
    if (!activeTenantId || desconectando) return;
    setDesconectando(true);
    setErroDesconectar(null);
    try {
      await GoogleAgendaService.desconectar(activeTenantId);
      setConfirmando(false);
      setSalvo(false);
      setSituacao({ conectada: false });
    } catch (err) {
      console.error("Falha ao desconectar o Google Agenda", err);
      setErroDesconectar(mensagemDeErro(err, "Não foi possível desconectar. Tente de novo."));
    } finally {
      setDesconectando(false);
    }
  }

  let conteudo;
  if (erroCarga) {
    conteudo = (
      <p role="alert" className="text-sm text-red-600">
        Não foi possível carregar o Google Agenda. Recarregue a página para tentar de novo.
      </p>
    );
  } else if (!situacao) {
    conteudo = <p className="text-sm text-gray-500">Carregando o Google Agenda…</p>;
  } else if (!situacao.conectada) {
    conteudo = (
      <>
        <p className="text-sm text-gray-600 mb-6">
          Os horários marcados no CRM vão para a sua agenda do Google, e o CRM avisa quando o horário já está ocupado.
        </p>
        <button type="button" onClick={conectar} className={botaoPrincipal}>
          Conectar Google Agenda
        </button>
      </>
    );
  } else if (situacao.situacao !== "ativa") {
    conteudo = (
      <>
        <p role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          A conexão com o Google Agenda caiu. Reconecte para os próximos horários irem para a sua agenda.
        </p>
        <button type="button" onClick={conectar} className={botaoPrincipal}>
          Reconectar
        </button>
      </>
    );
  } else {
    const opcoes = agendas.length > 0 ? agendas : [{ id: situacao.agenda_id, nome: situacao.agenda_nome, principal: true }];
    conteudo = (
      <>
        <p className="font-bold text-green-700 mb-4">{`Conectada como ${situacao.email}`}</p>
        {!situacao.conflito && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Sem permissão para ver horários ocupados: o CRM não vai avisar conflitos. Reconecte e permita ver a disponibilidade.
          </p>
        )}
        {erroAgendas && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            Não foi possível carregar as suas agendas. Recarregue a página para tentar de novo.
          </p>
        )}
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label htmlFor="google-agenda-agenda" className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Agenda
            </label>
            <select
              id="google-agenda-agenda"
              value={agendaId}
              onChange={(e) => { setAgendaId(e.target.value); setSalvo(false); }}
              className="w-full p-3 bg-gray-50 rounded-lg border border-gray-100 font-medium text-gray-700 outline-none focus:border-brand-blue"
            >
              {opcoes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="google-agenda-duracao" className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Duração padrão da consulta (min)
            </label>
            <input
              id="google-agenda-duracao"
              type="number"
              min={15}
              max={240}
              step={5}
              value={duracao}
              onChange={(e) => { setDuracao(e.target.value); setSalvo(false); }}
              className="w-full p-3 bg-gray-50 rounded-lg border border-gray-100 font-medium text-gray-700 outline-none focus:border-brand-blue"
            />
          </div>
          {salvo && (
            <p role="status" className="text-sm font-bold text-green-700">
              Salvo.
            </p>
          )}
          {erroSalvar && (
            <p role="alert" className="text-sm text-red-600">
              {erroSalvar}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={salvando} className={botaoPrincipal}>
              <Save size={16} aria-hidden="true" />
              Salvar
            </button>
            <button type="button" onClick={() => { setErroDesconectar(null); setConfirmando(true); }} className={botaoSecundario}>
              Desconectar
            </button>
          </div>
        </form>
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
          <CalendarDays size={16} aria-hidden="true" />
          Google Agenda
        </h2>
        {conteudo}
      </section>

      {confirmando && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50" onClick={() => !desconectando && setConfirmando(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="google-agenda-desconectar"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-2xl md:rounded-lg w-full max-w-sm p-6 shadow-xl text-gray-900"
          >
            <p id="google-agenda-desconectar" className="text-sm text-gray-700 mb-6">
              Desconectar o Google Agenda? O CRM para de usar a sua agenda, e os eventos já criados continuam nela. Para tirar também o acesso na sua Conta Google, remova o Unum People CRM nas{" "}
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer" className="font-bold text-brand-blue underline">
                permissões da conta
              </a>
              .
            </p>
            {erroDesconectar && (
              <p role="alert" className="mb-4 text-sm text-red-600">
                {erroDesconectar}
              </p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={desconectar} disabled={desconectando} aria-busy={desconectando ? "true" : undefined} className="flex-1 bg-red-600 text-white p-2 rounded font-bold disabled:opacity-50">
                Desconectar
              </button>
              <button type="button" onClick={() => setConfirmando(false)} disabled={desconectando} className="flex-1 bg-gray-100 p-2 rounded font-bold disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
