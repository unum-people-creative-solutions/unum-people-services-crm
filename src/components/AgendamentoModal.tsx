"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "lucide-react";
import { paraUTC, partesEmBrasilia, semLembretePush, validarAgendamento } from "@/lib/agendamento";

// Modal de agendamento do quadro (spec crm-agendamento-e-lembretes RF-52;
// blueprint DESIGN-BLUEPRINT-crm-agendamento §2). Casca do modal "Venda
// Concluída!": folha de baixo no celular, cartão central no desktop.

export interface AgendamentoModalProps {
  aberto: boolean;
  modo: "mover" | "alterar";
  nomeDoLead: string;
  valorInicial?: string;
  enviando: boolean;
  erro: string | null;
  onConfirmar(iso: string): void;
  onCancelar(): void;
}

const TEXTOS = {
  mover: { titulo: "Agendar horário", principal: "Confirmar agendamento", secundario: "Cancelar movimento" },
  alterar: { titulo: "Alterar horário", principal: "Salvar horário", secundario: "Cancelar" },
} as const;

const DIA = 24 * 60 * 60 * 1000;

// Hoje e hoje + 365 dias no calendário de Brasília (YYYY-MM-DD).
function limitesDaData(agora: Date) {
  const hoje = partesEmBrasilia(agora.toISOString()).data;
  const [a, m, d] = hoje.split("-").map(Number);
  const max = new Date(Date.UTC(a, m - 1, d) + 365 * DIA).toISOString().slice(0, 10);
  return { min: hoje, max };
}

export function AgendamentoModal(props: AgendamentoModalProps) {
  return <AnimatePresence>{props.aberto && <ConteudoDoModal {...props} />}</AnimatePresence>;
}

function ConteudoDoModal({ modo, nomeDoLead, valorInicial, enviando, erro, onConfirmar, onCancelar }: AgendamentoModalProps) {
  const textos = TEXTOS[modo];
  const inicial = valorInicial ? partesEmBrasilia(valorInicial) : { data: "", hora: "" };
  const [data, setData] = useState(inicial.data);
  const [hora, setHora] = useState(inicial.hora);
  const [erroData, setErroData] = useState<string | null>(null);
  const [erroHora, setErroHora] = useState<string | null>(null);
  // Lido já no primeiro render: o modal só monta no navegador, e trocar a variante
  // depois deixaria a folha presa no meio da animação do desktop (opacidade ~0,15).
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [limites] = useState(() => limitesDaData(new Date()));

  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idFuso = `${idBase}-fuso`;
  const idErroData = "agendamento-data-erro";
  const idErroHora = "agendamento-hora-erro";

  const dataRef = useRef<HTMLInputElement>(null);

  // Cancelar não vale enquanto a chamada está no ar (blueprint §2.3).
  const cancelar = () => {
    if (!enviando) onCancelar();
  };
  const cancelarRef = useRef(cancelar);
  cancelarRef.current = cancelar;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Foco inicial no campo Data; ao fechar, volta ao elemento que tinha o foco antes.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    dataRef.current?.focus();
    return () => {
      if (anterior && anterior !== document.body && document.contains(anterior)) anterior.focus();
    };
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelarRef.current();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  // Foco preso no modal: Tab no último volta ao primeiro, Shift+Tab no primeiro vai ao último.
  const prenderFoco = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focaveis = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), a[href]"),
    );
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  // O horário é a combinação dos dois campos: editar qualquer um tira os avisos antigos.
  const limparErros = () => {
    setErroData(null);
    setErroHora(null);
  };

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    let novoErroData: string | null = data ? null : "Informe a data.";
    let novoErroHora: string | null = hora ? null : "Informe a hora.";
    let iso: string | null = null;
    if (data && hora) {
      iso = paraUTC(data, hora);
      const problema = validarAgendamento(iso, new Date());
      if (problema === "Escolha um horário a partir de agora.") novoErroHora = problema;
      else if (problema) novoErroData = problema;
    }
    setErroData(novoErroData);
    setErroHora(novoErroHora);
    if (iso && !novoErroData && !novoErroHora) onConfirmar(iso);
  };

  let dicaCurta = false;
  if (data && hora) {
    const iso = paraUTC(data, hora);
    const agora = new Date();
    dicaCurta = validarAgendamento(iso, agora) === null && semLembretePush(iso, agora);
  }

  const classeCampo = (comErro: boolean) =>
    `w-full border p-3 rounded-md outline-none focus:ring-2 focus:ring-brand-blue font-bold text-gray-700 bg-white ${
      comErro ? "border-red-500" : ""
    }`;

  return (
    <motion.div
      data-testid="agendamento-fundo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={cancelar}
      className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center md:p-4 z-50 text-gray-900"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idFuso}
        onKeyDown={prenderFoco}
        initial={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
        animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
        exit={isMobile ? { y: "100%" } : { scale: 0.9, opacity: 0 }}
        transition={isMobile ? { type: "spring", damping: 25, stiffness: 300 } : { duration: 0.2 }}
        drag={isMobile ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(_: unknown, info: { offset: { y: number } }) => {
          if (isMobile && info.offset.y > 150) cancelar();
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="bg-white rounded-t-[32px] md:rounded-lg w-full max-w-sm border-t-4 border-brand-blue shadow-2xl max-h-[95vh] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-6 pt-6">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4 md:hidden" />
          <h2 id={idTitulo} className="text-lg font-bold text-brand-blue flex items-center gap-2">
            <Calendar size={20} aria-hidden="true" />
            {textos.titulo}
          </h2>
          <p className="text-sm font-bold text-gray-800 mt-1 break-words">{nomeDoLead}</p>
          <p id={idFuso} className="text-xs text-gray-500 mt-1">Data e hora no horário de Brasília.</p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-6 pt-4 custom-scrollbar">
          <form onSubmit={confirmar} noValidate className="space-y-4">
            <div>
              <label htmlFor="agendamento-data" className="block text-xs font-bold text-gray-400 uppercase mb-1">Data</label>
              <input
                ref={dataRef}
                id="agendamento-data"
                type="date"
                required
                min={limites.min}
                max={limites.max}
                value={data}
                onChange={(e) => { setData(e.target.value); limparErros(); }}
                aria-invalid={erroData ? "true" : undefined}
                aria-describedby={erroData ? idErroData : undefined}
                className={classeCampo(!!erroData)}
              />
              {erroData && <p id={idErroData} className="text-red-500 text-xs mt-1">{erroData}</p>}
            </div>
            <div>
              <label htmlFor="agendamento-hora" className="block text-xs font-bold text-gray-400 uppercase mb-1">Hora</label>
              <input
                id="agendamento-hora"
                type="time"
                required
                value={hora}
                onChange={(e) => { setHora(e.target.value); limparErros(); }}
                aria-invalid={erroHora ? "true" : undefined}
                aria-describedby={erroHora ? idErroHora : undefined}
                className={classeCampo(!!erroHora)}
              />
              {erroHora && <p id={idErroHora} className="text-red-500 text-xs mt-1">{erroHora}</p>}
            </div>

            <p className="text-xs text-gray-500">
              {dicaCurta
                ? "Faltam menos de uma hora: não haverá lembrete por notificação."
                : "Uma hora antes, quem tem as notificações ligadas recebe um lembrete."}
            </p>

            {erro && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              aria-busy={enviando ? "true" : undefined}
              className="w-full bg-brand-blue text-white p-4 rounded-md font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-blue"
            >
              {enviando ? "Salvando…" : textos.principal}
            </button>
            <button
              type="button"
              onClick={cancelar}
              disabled={enviando}
              className="w-full bg-gray-100 p-3 mt-2 rounded font-bold text-gray-500 text-xs disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {textos.secundario}
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
