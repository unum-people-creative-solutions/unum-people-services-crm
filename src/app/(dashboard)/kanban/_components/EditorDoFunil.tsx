import { useEffect, useRef, type ReactNode } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';

// Modo de edição do funil (spec crm-funil-e-atividades-f1, FUN-10 a FUN-18).
// A página guarda o rascunho; este arquivo só desenha os controles.

type ErroDoEditor = { texto: string; recarregar: boolean };

type Corpo = { error?: string; motivo?: string; etapas?: string[] };

export function mensagemDeErroDoFunil(err: unknown, nomesPorId: Map<string, string>): ErroDoEditor {
  const response = (err as { response?: { status?: number; data?: Corpo } } | null)?.response;
  const status = response?.status;
  const data = response?.data;

  if (status === 409 && data?.error === 'funil_mudou') {
    return { texto: 'Outra pessoa alterou o funil. Recarregue para ver a versão atual.', recarregar: true };
  }
  if (status === 409 && data?.error === 'etapa_com_leads') {
    const id = data.etapas?.[0];
    const nome = (id && nomesPorId.get(id)) || '';
    return { texto: `A coluna ${nome} tem leads. Mova os leads antes de remover.`, recarregar: false };
  }
  if (status === 400 && data?.error === 'funil_invalido') {
    if (data.motivo === 'nome_invalido') return { texto: 'Cada coluna precisa de um nome de 1 a 30 caracteres.', recarregar: false };
    if (data.motivo === 'nome_repetido') return { texto: 'Duas colunas não podem ter o mesmo nome.', recarregar: false };
    if (data.motivo === 'limite_de_etapas') return { texto: 'O funil pode ter no máximo 10 colunas.', recarregar: false };
    return { texto: 'Não foi possível salvar o funil.', recarregar: false };
  }
  if (status === 403) return { texto: 'Você não tem permissão para editar o funil.', recarregar: false };
  return { texto: 'Não foi possível salvar o funil. Tente de novo.', recarregar: false };
}

export function BarraDoEditor({
  erro,
  salvando,
  onSalvar,
  onCancelar,
  onRecarregar,
}: {
  erro: ErroDoEditor | null;
  salvando: boolean;
  onSalvar: () => void;
  onCancelar: () => void;
  onRecarregar: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 px-4 md:px-0">
      {erro && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{erro.texto}</p>
          {erro.recarregar && (
            <button type="button" onClick={onRecarregar} className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-bold text-red-800 border border-red-200">
              Recarregar
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onSalvar} disabled={salvando} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          Salvar
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-gray-700 border border-gray-200">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function NomeDaColuna({ nome, focar, onRenomear }: { nome: string; focar: boolean; onRenomear: (nome: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focar || !ref.current) return;
    ref.current.focus();
    ref.current.select();
  }, [focar]);
  return (
    <input
      ref={ref}
      aria-label={`Nome da coluna ${nome}`}
      value={nome}
      onChange={(e) => onRenomear(e.target.value)}
      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-bold text-gray-800"
    />
  );
}

export function BotaoRemover({ quantidade, onRemover }: { quantidade: number; onRemover: () => void }) {
  const bloqueado = quantidade > 0;
  const texto = bloqueado ? `Mova os ${quantidade} leads antes de remover` : 'Remover coluna';
  return (
    <button
      type="button"
      disabled={bloqueado}
      aria-label={texto}
      onClick={onRemover}
      className="self-start w-fit text-left text-xs font-bold text-red-700 disabled:text-gray-500"
    >
      {texto}
    </button>
  );
}

const CLASSE_DA_FAIXA = 'flex gap-4 h-full overflow-x-auto pb-4 custom-scrollbar snap-x snap-mandatory scroll-smooth px-4 md:px-0';

export function FaixaDoFunil({ editando, children }: { editando: boolean; children: ReactNode }) {
  if (!editando) return <div className={CLASSE_DA_FAIXA}>{children}</div>;
  return (
    <Droppable droppableId="funil" type="COLUMN" direction="horizontal">
      {(provided) => (
        <div ref={provided.innerRef} {...provided.droppableProps} className={CLASSE_DA_FAIXA}>
          {children}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

export function ColunaArrastavel({
  editando,
  chave,
  indice,
  arrastavel,
  children,
}: {
  editando: boolean;
  chave: string;
  indice: number;
  arrastavel: boolean;
  children: ReactNode;
}) {
  if (!editando) return <>{children}</>;
  return (
    <Draggable draggableId={chave} index={indice} isDragDisabled={!arrastavel}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="h-full">
          {children}
        </div>
      )}
    </Draggable>
  );
}

export function SetasDaColuna({
  podeEsquerda,
  podeDireita,
  onEsquerda,
  onDireita,
}: {
  podeEsquerda: boolean;
  podeDireita: boolean;
  onEsquerda: () => void;
  onDireita: () => void;
}) {
  return (
    <div className="md:hidden flex gap-2">
      <button type="button" aria-label="Mover para a esquerda" disabled={!podeEsquerda} onClick={onEsquerda} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-bold text-gray-700 disabled:text-gray-400">
        ←
      </button>
      <button type="button" aria-label="Mover para a direita" disabled={!podeDireita} onClick={onDireita} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-bold text-gray-700 disabled:text-gray-400">
        →
      </button>
    </div>
  );
}

export function BotaoAdicionar({ pode, onAdicionar }: { pode: boolean; onAdicionar: () => void }) {
  return (
    <button
      type="button"
      disabled={!pode}
      aria-label={pode ? 'Adicionar coluna' : 'O funil pode ter no máximo 10 colunas.'}
      onClick={onAdicionar}
      className="self-start shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg font-bold text-gray-700 disabled:text-gray-400"
    >
      +
    </button>
  );
}
