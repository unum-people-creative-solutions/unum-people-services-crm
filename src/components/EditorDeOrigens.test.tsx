import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorDeOrigens } from './EditorDeOrigens';
import { OrigensService, type Origens } from '@/services/api';
import origensPadraoJson from '@/services/__fixtures__/get-crm-origens-padrao.json';
import origensSalvasJson from '@/services/__fixtures__/put-crm-origens-feira.json';

// spec: crm-origens-personalizadas T13, T14 (RF-OR-03, RF-OR-06, RF-OR-08, RF-OR-10).

const origensPadrao = origensPadraoJson as Origens;
const origensSalvas = origensSalvasJson as Origens;

vi.mock('@/services/api', async () => {
  const real = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  return {
    mensagemDeErro: real.mensagemDeErro,
    OrigensService: { ler: vi.fn(), salvar: vi.fn() },
  };
});

function abrir() {
  const aoSalvar = vi.fn();
  const aoAtualizar = vi.fn();
  const aoFechar = vi.fn();
  render(
    <EditorDeOrigens
      origens={origensPadrao}
      tenantId="t1"
      onSalvo={aoSalvar}
      onAtualizada={aoAtualizar}
      onFechar={aoFechar}
    />,
  );
  return { aoSalvar, aoAtualizar, aoFechar, dialogo: screen.getByRole('dialog', { name: 'Origens' }) };
}

async function adicionar(dialogo: HTMLElement, nome: string) {
  const campo = within(dialogo).getByLabelText('Nova origem');
  await userEvent.clear(campo);
  if (nome) await userEvent.type(campo, nome);
  await userEvent.click(within(dialogo).getByRole('button', { name: 'Adicionar' }));
}

describe('EditorDeOrigens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adicionar "Feira" e Salvar envia a lista com a origem nova no fim (T13)', async () => {
    (OrigensService.salvar as any).mockResolvedValue(origensSalvas);
    const { dialogo, aoSalvar, aoFechar } = abrir();

    await adicionar(dialogo, '  Feira ');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith(origensSalvas));
    expect(OrigensService.salvar).toHaveBeenCalledWith(0, [...origensPadrao.itens, 'Feira'], 't1');
    expect(aoFechar).toHaveBeenCalled();
  });

  it('"Remover Instagram" tira o item da lista enviada (T13)', async () => {
    (OrigensService.salvar as any).mockResolvedValue({ versao: 1, itens: ['Indicação', 'WhatsApp', 'Facebook', 'Outro'] });
    const { dialogo } = abrir();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Remover Instagram' }));
    expect(within(dialogo).queryByRole('button', { name: 'Remover Instagram' })).not.toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(OrigensService.salvar).toHaveBeenCalledTimes(1));
    expect(OrigensService.salvar).toHaveBeenCalledWith(0, ['Indicação', 'WhatsApp', 'Facebook', 'Outro'], 't1');
  });

  it.each([
    ['duplicata ignorando maiúscula', 'instagram', 'Essa origem já existe.'],
    ['duplicata ignorando acento', 'Indicacao', 'Essa origem já existe.'],
    ['nome longo', 'x'.repeat(31), 'O nome pode ter no máximo 30 caracteres.'],
    ['nome vazio', '   ', 'Digite o nome da origem.'],
    ['caractere de controle', 'Feira\u0007', 'O nome tem caractere inválido.'],
  ])('%s mostra a mensagem e não chama a API (T13)', async (_nome, texto, mensagem) => {
    const { dialogo } = abrir();
    const campo = within(dialogo).getByLabelText('Nova origem');
    await userEvent.type(campo, texto);
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Adicionar' }));

    expect(within(dialogo).getByText(mensagem)).toBeInTheDocument();
    expect(within(dialogo).getAllByRole('button', { name: /^Remover / })).toHaveLength(origensPadrao.itens.length);
    expect(OrigensService.salvar).not.toHaveBeenCalled();
  });

  it('o 21º item é recusado no limite de 20 (T13)', async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => `Origem ${i + 1}`);
    render(
      <EditorDeOrigens origens={{ versao: 3, itens: vinte }} tenantId="t1" onSalvo={vi.fn()} onAtualizada={vi.fn()} onFechar={vi.fn()} />,
    );
    const dialogo = screen.getByRole('dialog', { name: 'Origens' });
    await adicionar(dialogo, 'Origem extra');
    expect(within(dialogo).getByText('A lista pode ter no máximo 20 origens.')).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Remover Origem extra' })).not.toBeInTheDocument();
  });

  it('lista vazia mostra a mensagem e não chama a API (T13)', async () => {
    const { dialogo } = abrir();
    for (const nome of origensPadrao.itens) {
      await userEvent.click(within(dialogo).getByRole('button', { name: `Remover ${nome}` }));
    }
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    expect(within(dialogo).getByText('Mantenha ao menos uma origem.')).toBeInTheDocument();
    expect(OrigensService.salvar).not.toHaveBeenCalled();
  });

  it('409 recarrega a lista e avisa que mudou em outro aparelho (T14, RF-OR-08)', async () => {
    (OrigensService.salvar as any).mockRejectedValue({ response: { status: 409, data: { error: 'origens_mudaram' } } });
    (OrigensService.ler as any).mockResolvedValue({ versao: 4, itens: ['Indicação', 'Panfleto'] });
    const { dialogo, aoAtualizar, aoSalvar, aoFechar } = abrir();

    await adicionar(dialogo, 'Feira');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialogo).findByText('A lista mudou em outro aparelho. Confira e salve de novo.')).toBeInTheDocument();
    expect(OrigensService.ler).toHaveBeenCalledWith('t1');
    expect(aoAtualizar).toHaveBeenCalledWith({ versao: 4, itens: ['Indicação', 'Panfleto'] });
    expect(within(dialogo).getByText('Panfleto')).toBeInTheDocument();
    expect(within(dialogo).queryByText('Feira')).not.toBeInTheDocument();
    expect(aoSalvar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();

    // Salvar de novo usa a versão recarregada.
    (OrigensService.salvar as any).mockResolvedValue({ versao: 5, itens: ['Indicação', 'Panfleto'] });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(OrigensService.salvar).toHaveBeenLastCalledWith(4, ['Indicação', 'Panfleto'], 't1'));
  });

  it('500 mostra o erro e mantém o diálogo aberto (T14, RF-OR-10)', async () => {
    (OrigensService.salvar as any).mockRejectedValue({ response: { status: 500, data: { error: 'Failed to save origins' } } });
    const { dialogo, aoSalvar, aoFechar } = abrir();

    await adicionar(dialogo, 'Feira');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Não foi possível salvar as origens. Tente de novo.');
    expect(screen.getByRole('dialog', { name: 'Origens' })).toBeInTheDocument();
    expect(aoSalvar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(within(dialogo).getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('Salvar fica desabilitado enquanto salva', async () => {
    let resolver: (v: Origens) => void = () => {};
    (OrigensService.salvar as any).mockReturnValue(new Promise((r) => { resolver = r; }));
    const { dialogo } = abrir();

    await adicionar(dialogo, 'Feira');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(within(dialogo).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(OrigensService.salvar).toHaveBeenCalledTimes(1);

    resolver(origensSalvas);
    await waitFor(() => expect(OrigensService.salvar).toHaveBeenCalledTimes(1));
  });

  it('Cancelar fecha sem chamar a API', async () => {
    const { dialogo, aoFechar } = abrir();
    await adicionar(dialogo, 'Feira');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(aoFechar).toHaveBeenCalled();
    expect(OrigensService.salvar).not.toHaveBeenCalled();
  });
});
