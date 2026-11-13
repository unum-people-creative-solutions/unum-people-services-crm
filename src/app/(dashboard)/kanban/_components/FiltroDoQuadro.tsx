"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Filter } from "lucide-react";

function classeDoFiltro(ativo: boolean): string {
  const base = "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-bold";
  return ativo ? `${base} bg-brand-blue text-white` : `${base} text-gray-800 hover:bg-gray-50`;
}

// Hoje e Adiados ficam neste botão, ao lado de Atualizar.
// O menu abre por cima do quadro, fora do header.
// hoje/adiados null: o filtro não existe. false/true: desligado ou ligado.

export function FiltroDoQuadro({
  hoje,
  adiados,
  quantidadeAdiados,
  onHoje,
  onAdiados,
}: {
  hoje: boolean | null;
  adiados: boolean | null;
  quantidadeAdiados: number;
  onHoje: () => void;
  onAdiados: () => void;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({ top: 0, right: 0 });
  if (hoje === null && adiados === null) return null;
  const ativos = (hoje ? 1 : 0) + (adiados ? 1 : 0);
  const nome = ativos > 0 ? `Filtros, ${ativos}` : "Filtros";

  const alternar = () => {
    const rect = botao.current?.getBoundingClientRect();
    if (rect) {
      setPosicao({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setAberto((atual) => !atual);
  };

  return (
    <>
      <button
        ref={botao}
        type="button"
        aria-label={nome}
        aria-expanded={aberto}
        aria-pressed={ativos > 0}
        onClick={alternar}
        className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold ${ativos > 0 ? "border-brand-blue bg-brand-blue text-white" : "border-gray-200 bg-white text-gray-500"}`}
      >
        <Filter size={16} aria-hidden="true" />
        {ativos > 0 ? <span>{ativos}</span> : null}
      </button>
      {aberto && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setAberto(false)} />
          <div
            role="group"
            aria-label="Filtros do quadro"
            style={{ top: posicao.top, right: posicao.right }}
            className="fixed z-[80] flex min-w-40 flex-col gap-1 rounded-lg border bg-white p-2 shadow-lg"
          >
            {hoje !== null && (
              <button type="button" aria-pressed={hoje} onClick={onHoje} className={classeDoFiltro(hoje)}>
                Hoje
                {hoje ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            )}
            {adiados !== null && (
              <button type="button" aria-pressed={adiados} onClick={onAdiados} className={classeDoFiltro(adiados)}>
                {`Adiados (${quantidadeAdiados})`}
                {adiados ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
