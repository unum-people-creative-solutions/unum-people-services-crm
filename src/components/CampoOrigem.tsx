'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { EditorDeOrigens } from '@/components/EditorDeOrigens';
import { ORIGENS_PADRAO } from '@/lib/origens';
import type { EstadoDasOrigens } from '@/hooks/useOrigens';

interface Props {
  id: string;
  valor: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  // Lead do site: mostra o texto, sem select e sem lápis (RF-OR-09).
  travado: boolean;
  // crm.lead.editar. A tela só esconde o lápis; quem autoriza a gravação é a API.
  podeEditar: boolean;
  // Estado do useOrigens, chamado uma vez por quem usa os campos.
  origens: EstadoDasOrigens;
  tenantId: string;
  classeDoRotulo?: string;
}

const CLASSE_DO_ROTULO = 'mb-1 block text-xs font-bold uppercase text-gray-500';

// Campo Origem do lead (spec crm-origens-personalizadas): as opções são as da conta mais a
// origem atual do lead, mesmo fora da lista (RF-OR-07).
export function CampoOrigem({ id, valor, onChange, onBlur, travado, podeEditar, origens, tenantId, classeDoRotulo }: Props) {
  const [aberto, setAberto] = useState(false);
  const lista = origens.origens;
  const base = lista ? lista.itens : origens.erro ? ORIGENS_PADRAO : [];
  const opcoes = valor !== '' && !base.includes(valor) ? [...base, valor] : base;

  return (
    <div>
      <label htmlFor={id} className={classeDoRotulo ?? CLASSE_DO_ROTULO}>Origem</label>
      {travado ? (
        <div id={id} className="rounded-md border bg-gray-50 p-2 text-gray-500">
          <p className="break-all">{valor}</p>
          <p className="mt-1 text-[10px] font-medium text-amber-600">Leads vindos do site não podem ter a origem alterada.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <select
              id={id}
              value={valor}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              className="w-full rounded-md border bg-white p-2 outline-none focus:ring-2 focus:ring-brand-blue"
            >
              {valor === '' && <option value="">Selecione</option>}
              {opcoes.map((origem) => <option key={origem} value={origem}>{origem}</option>)}
            </select>
            {podeEditar && lista && (
              <button
                type="button"
                aria-label="Editar origens"
                onClick={() => setAberto(true)}
                className="shrink-0 rounded-md border bg-white p-2 text-gray-500 hover:text-brand-blue"
              >
                <Pencil size={16} />
              </button>
            )}
          </div>
          {origens.erro && (
            <p className="mt-1 text-xs text-amber-700">Não foi possível carregar suas origens. Mostrando as padrão.</p>
          )}
          {aberto && lista && (
            <EditorDeOrigens
              origens={lista}
              tenantId={tenantId}
              onSalvo={origens.substituir}
              onAtualizada={origens.substituir}
              onFechar={() => setAberto(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
