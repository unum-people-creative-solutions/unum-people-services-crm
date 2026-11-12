"use client";

import { useState } from "react";
import { Filter } from "lucide-react";

// Hoje e Adiados ficam neste botão do header (AJU-04).
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
  const [aberto, setAberto] = useState(false);
  if (hoje === null && adiados === null) return null;
  const ativos = (hoje ? 1 : 0) + (adiados ? 1 : 0);
  const nome = ativos > 0 ? `Filtros, ${ativos}` : "Filtros";
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={nome}
        aria-expanded={aberto}
        aria-pressed={ativos > 0}
        onClick={() => setAberto((atual) => !atual)}
        className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold ${ativos > 0 ? "border-brand-blue bg-brand-blue text-white" : "border-gray-200 bg-white text-gray-500"}`}
      >
        <Filter size={16} aria-hidden="true" />
        {ativos > 0 ? <span>{ativos}</span> : null}
      </button>
      {aberto && (
        <div role="group" aria-label="Filtros do quadro" className="absolute left-0 top-full z-20 mt-2 flex min-w-40 flex-col gap-1 rounded-lg border bg-white p-2 shadow-lg">
          {hoje !== null && (
            <button type="button" aria-pressed={hoje} onClick={onHoje} className="rounded-md px-3 py-2 text-left text-sm font-bold text-gray-800">
              Hoje
            </button>
          )}
          {adiados !== null && (
            <button type="button" aria-pressed={adiados} onClick={onAdiados} className="rounded-md px-3 py-2 text-left text-sm font-bold text-gray-800">
              {`Adiados (${quantidadeAdiados})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
