"use client";

import { useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { venceEmDaData, venceEmDoAtalho, type AtalhoDeAdiar } from "@/lib/adiar";

export interface PedidoDeAdiar {
  vence_em: string;
  descricao?: string;
}

export function AdiarLead({
  enviando,
  erro,
  onCancelar,
  onConfirmar,
}: {
  enviando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onConfirmar: (pedido: PedidoDeAdiar) => void;
}) {
  const base = useId();
  const tituloId = `${base}-titulo`;
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const aviso = erroLocal ?? erro;

  const corpo = (venceEm: string): PedidoDeAdiar => {
    const descricao = motivo.trim();
    return descricao ? { vence_em: venceEm, descricao } : { vence_em: venceEm };
  };

  const peloAtalho = (atalho: AtalhoDeAdiar) => {
    if (enviando) return;
    setErroLocal(null);
    onConfirmar(corpo(venceEmDoAtalho(atalho, new Date())));
  };

  const pelaData = (evento: FormEvent) => {
    evento.preventDefault();
    if (enviando) return;
    if (!data) {
      setErroLocal("Informe a data.");
      return;
    }
    setErroLocal(null);
    onConfirmar(corpo(venceEmDaData(data, hora)));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 text-gray-900" onClick={onCancelar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={(evento) => {
          if (evento.key === "Escape") onCancelar();
        }}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={tituloId} className="text-lg font-bold">Adiar lead</h2>
          <button type="button" onClick={onCancelar} aria-label="Fechar" className="p-2 text-gray-500 hover:text-gray-800">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {aviso && (
          <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aviso}</p>
        )}
        <form aria-label="Quando retomar" onSubmit={pelaData} className="space-y-3">
          <div>
            <label htmlFor={`${base}-motivo`} className="text-xs font-bold uppercase text-gray-500">Motivo</label>
            <textarea
              id={`${base}-motivo`}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              className="mt-1 min-h-[72px] w-full rounded-md border p-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={enviando} onClick={() => peloAtalho("amanha")} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">Amanhã</button>
            <button type="button" disabled={enviando} onClick={() => peloAtalho("semana")} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">Em 1 semana</button>
            <button type="button" disabled={enviando} onClick={() => peloAtalho("mes")} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">Em 1 mês</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${base}-data`} className="text-xs font-bold uppercase text-gray-500">Data</label>
              <input
                id={`${base}-data`}
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
                className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
            <div>
              <label htmlFor={`${base}-hora`} className="text-xs font-bold uppercase text-gray-500">Hora</label>
              <input
                id={`${base}-hora`}
                type="time"
                value={hora}
                onChange={(evento) => setHora(evento.target.value)}
                className="mt-1 w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">Sem hora, vale 9h de Brasília.</p>
          <button type="submit" disabled={enviando} className="w-full rounded-md bg-brand-blue p-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            Adiar
          </button>
        </form>
      </div>
    </div>
  );
}
