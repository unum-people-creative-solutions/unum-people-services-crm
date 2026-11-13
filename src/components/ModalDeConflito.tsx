"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { paraUTC, partesEmBrasilia } from "@/lib/agendamento";
import { GoogleAgendaService } from "@/services/api";

// Confirmação antes de gravar um evento em horário já ocupado. A consulta
// que falha não bloqueia: o mesmo critério do aviso do agendamento.

const MINUTO = 60 * 1000;
const ATRASO_DO_CONFLITO = 400;

export async function conflitosNoHorario(
  tenantId: string,
  inicio: string,
  duracaoMin: number,
  leadId?: string,
  exceto?: { inicio: string; fim: string },
): Promise<string[] | null> {
  const fim = new Date(Date.parse(inicio) + duracaoMin * MINUTO).toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    const ocupado = await GoogleAgendaService.ocupado(tenantId, inicio, fim, leadId);
    const deOutros = exceto
      ? ocupado.filter((intervalo) => Date.parse(intervalo.inicio) !== Date.parse(exceto.inicio) || Date.parse(intervalo.fim) !== Date.parse(exceto.fim))
      : ocupado;
    return deOutros.map((intervalo) => `${partesEmBrasilia(intervalo.inicio).hora}–${partesEmBrasilia(intervalo.fim).hora}`);
  } catch (err) {
    console.error("Falha ao consultar horários ocupados", err);
    return null;
  }
}

export function ModalDeConflito({
  data,
  hora,
  duracaoMin,
  tenantId,
  leadId,
  intervalos,
  exceto,
  onSalvar,
  onCancelar,
}: {
  data: string;
  hora: string;
  duracaoMin: number;
  tenantId: string;
  leadId?: string;
  intervalos: string[];
  exceto?: { inicio: string; fim: string };
  onSalvar: (data: string, hora: string, mesmoAssim: boolean) => void;
  onCancelar: () => void;
}) {
  const tituloId = useId();
  const [dataLocal, setDataLocal] = useState(data);
  const [horaLocal, setHoraLocal] = useState(hora);
  const [avisos, setAvisos] = useState(intervalos);
  const [falhou, setFalhou] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (dataLocal === data && horaLocal === hora) return;
    if (!dataLocal || !horaLocal || duracaoMin <= 0) return;
    let cancelado = false;
    setConsultando(true);
    const espera = setTimeout(() => {
      void conflitosNoHorario(tenantId, paraUTC(dataLocal, horaLocal), duracaoMin, leadId, exceto).then((resultado) => {
        if (cancelado) return;
        if (resultado === null) {
          setAvisos([]);
          setFalhou(true);
        } else {
          setAvisos(resultado);
          setFalhou(false);
        }
        setConsultando(false);
      });
    }, ATRASO_DO_CONFLITO);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [dataLocal, horaLocal, data, hora, duracaoMin, tenantId, leadId, exceto]);

  const mesmoAssim = falhou || avisos.length > 0;
  const texto = falhou
    ? "Não foi possível consultar a agenda. Você pode salvar mesmo assim."
    : avisos.length > 0
      ? `Esse horário já está ocupado na sua agenda (${avisos.join(", ")}).`
      : "Este horário está livre na sua agenda.";
  const rotulo = consultando ? "Consultando a agenda…" : mesmoAssim ? "Salvar mesmo assim" : "Salvar";

  const salvar = () => {
    if (salvando || consultando || !dataLocal || !horaLocal) return;
    setSalvando(true);
    onSalvar(dataLocal, horaLocal, mesmoAssim);
  };

  const aoTeclar = (evento: KeyboardEvent) => {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      onCancelar();
      return;
    }
    if (evento.key !== "Tab") return;
    const focaveis = Array.from(
      (evento.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])"),
    );
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 text-gray-900" onClick={onCancelar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={aoTeclar}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id={tituloId} className="text-lg font-bold">{avisos.length > 0 || falhou ? "Horário ocupado" : "Horário livre"}</h2>
        <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{texto}</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            salvar();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${tituloId}-data`} className="text-xs font-bold uppercase text-gray-500">Data</label>
              <input
                id={`${tituloId}-data`}
                type="date"
                value={dataLocal}
                onChange={(evento) => setDataLocal(evento.target.value)}
                className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div>
              <label htmlFor={`${tituloId}-hora`} className="text-xs font-bold uppercase text-gray-500">Hora</label>
              <input
                id={`${tituloId}-hora`}
                type="time"
                value={horaLocal}
                onChange={(evento) => setHoraLocal(evento.target.value)}
                className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">Horário de Brasília.</p>
          <button
            type="submit"
            disabled={consultando || salvando || !dataLocal || !horaLocal}
            className="w-full rounded-md bg-brand-blue p-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rotulo}
          </button>
          <button type="button" onClick={onCancelar} className="w-full rounded-md bg-gray-100 p-3 text-sm font-bold text-gray-600">
            Voltar
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
