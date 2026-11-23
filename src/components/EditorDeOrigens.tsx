'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { OrigensService, mensagemDeErro, type Origens } from '@/services/api';
import {
  MENSAGEM_DO_MOTIVO,
  motivoConhecido,
  validarLista,
  validarNovaOrigem,
} from '@/lib/origens';

const MSG_SALVAR = 'Não foi possível salvar as origens. Tente de novo.';
const MSG_MUDARAM = 'A lista mudou em outro aparelho. Confira e salve de novo.';
const MSG_RECARREGAR = 'A lista mudou em outro aparelho e não foi possível recarregá-la. Feche e abra de novo.';

interface Props {
  origens: Origens;
  tenantId: string;
  // Lista gravada pela API: o campo passa a mostrá-la e o diálogo fecha.
  onSalvo: (salva: Origens) => void;
  // Lista relida depois de um 409: o campo também passa a mostrá-la, e o diálogo segue aberto.
  onAtualizada: (lida: Origens) => void;
  onFechar: () => void;
}

// Diálogo "Origens" (spec crm-origens-personalizadas RF-OR-03, RF-OR-06, RF-OR-08, RF-OR-10).
// Vai para o <body> para não ficar dentro do <form> do lead nem herdar o fieldset desabilitado.
export function EditorDeOrigens({ origens, tenantId, onSalvo, onAtualizada, onFechar }: Props) {
  const tituloId = useId();
  const campoId = useId();
  const [versao, setVersao] = useState(origens.versao);
  const [itens, setItens] = useState<string[]>(origens.itens);
  const [novo, setNovo] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const gravando = useRef(false);
  const campoNovo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoNovo.current?.focus();
  }, []);

  const adicionar = () => {
    const resultado = validarNovaOrigem(novo, itens);
    if (!resultado.ok) {
      setMensagem(MENSAGEM_DO_MOTIVO[resultado.motivo]);
      return;
    }
    setItens([...itens, resultado.nome]);
    setNovo('');
    setMensagem(null);
    campoNovo.current?.focus();
  };

  const remover = (nome: string) => {
    setItens(itens.filter((item) => item !== nome));
    setMensagem(null);
  };

  const recarregarDepoisDoConflito = async () => {
    try {
      const lida = await OrigensService.ler(tenantId);
      setVersao(lida.versao);
      setItens(lida.itens);
      setNovo('');
      onAtualizada(lida);
      setMensagem(MSG_MUDARAM);
    } catch (err) {
      setMensagem(mensagemDeErro(err, MSG_RECARREGAR));
    }
  };

  const salvar = async () => {
    if (gravando.current) return;
    // Texto que sobrou em "Nova origem" entra na lista, para não se perder sem aviso.
    let lista = itens;
    if (novo.trim() !== '') {
      const resultado = validarNovaOrigem(novo, itens);
      if (!resultado.ok) {
        setMensagem(MENSAGEM_DO_MOTIVO[resultado.motivo]);
        return;
      }
      lista = [...itens, resultado.nome];
    }
    const motivo = validarLista(lista);
    if (motivo) {
      setMensagem(MENSAGEM_DO_MOTIVO[motivo]);
      return;
    }

    gravando.current = true;
    setSalvando(true);
    setMensagem(null);
    try {
      const salva = await OrigensService.salvar(versao, lista, tenantId);
      onSalvo(salva);
      onFechar();
    } catch (err) {
      const resposta = (err as { response?: { status?: number; data?: { error?: string; motivo?: unknown } } } | null)?.response;
      if (resposta?.status === 409) {
        await recarregarDepoisDoConflito();
      } else if (resposta?.status === 400 && resposta.data?.error === 'origens_invalidas' && motivoConhecido(resposta.data.motivo)) {
        setMensagem(MENSAGEM_DO_MOTIVO[resposta.data.motivo]);
      } else {
        setMensagem(mensagemDeErro(err, MSG_SALVAR));
      }
    } finally {
      gravando.current = false;
      setSalvando(false);
    }
  };

  const conteudo = (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 text-gray-900 md:items-center md:p-4"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          if (!gravando.current) onFechar();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-t-[32px] border-t-4 border-brand-blue bg-white p-6 shadow-xl md:rounded-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={tituloId} className="text-lg font-bold text-brand-blue">Origens</h2>
          <button type="button" aria-label="Fechar" onClick={onFechar} disabled={salvando} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {mensagem && (
          <p role="alert" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{mensagem}</p>
        )}

        <ul className="mb-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {itens.map((nome) => (
            <li key={nome} className="flex items-center justify-between gap-2 rounded-md border bg-gray-50 px-3 py-2">
              <span className="break-all">{nome}</span>
              <button
                type="button"
                aria-label={`Remover ${nome}`}
                onClick={() => remover(nome)}
                disabled={salvando}
                className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>

        <div className="mb-6">
          <label htmlFor={campoId} className="mb-1 block text-sm font-bold text-gray-700">Nova origem</label>
          <div className="flex gap-2">
            <input
              id={campoId}
              ref={campoNovo}
              type="text"
              value={novo}
              disabled={salvando}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionar();
                }
              }}
              className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <button
              type="button"
              onClick={adicionar}
              disabled={salvando}
              className="shrink-0 rounded-md bg-gray-100 px-3 font-bold text-brand-blue hover:bg-gray-200 disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onFechar} disabled={salvando} className="flex-1 rounded-md bg-gray-100 p-3 font-bold disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="flex-1 rounded-md bg-brand-orange p-3 font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(conteudo, document.body);
}
