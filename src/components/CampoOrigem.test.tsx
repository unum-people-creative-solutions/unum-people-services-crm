import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useForm, Controller } from 'react-hook-form';
import { CampoOrigem } from './CampoOrigem';
import { useOrigens } from '@/hooks/useOrigens';
import { OrigensService, type Origens } from '@/services/api';
import { useTenant } from '@/contexts/TenantContext';
import origensPadraoJson from '@/services/__fixtures__/get-crm-origens-padrao.json';
import origensSalvasJson from '@/services/__fixtures__/put-crm-origens-feira.json';

// spec: crm-origens-personalizadas T10, T11, T12, T15 e o fim de T16 (RF-OR-01, 02, 07, 09, 10).

const origensPadrao = origensPadraoJson as Origens;
const origensSalvas = origensSalvasJson as Origens;

vi.mock('@/services/api', async () => {
  const real = await vi.importActual<typeof import('@/services/api')>('@/services/api');
  return {
    ORIGENS_PADRAO: real.ORIGENS_PADRAO,
    mensagemDeErro: real.mensagemDeErro,
    OrigensService: { ler: vi.fn(), salvar: vi.fn() },
  };
});

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: vi.fn(),
}));

function Formulario({
  inicial,
  travado = false,
  podeEditar = true,
  aoEnviar = () => {},
}: {
  inicial: string;
  travado?: boolean;
  podeEditar?: boolean;
  aoEnviar?: (dados: { origem: string }) => void;
}) {
  const origens = useOrigens();
  const form = useForm<{ origem: string }>({ defaultValues: { origem: inicial } });
  return (
    <form onSubmit={form.handleSubmit(aoEnviar)}>
      <Controller
        control={form.control}
        name="origem"
        render={({ field }) => (
          <CampoOrigem
            id="campo-origem"
            valor={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            travado={travado}
            podeEditar={podeEditar}
            origens={origens}
            tenantId="t1"
          />
        )}
      />
      <button type="submit">Enviar</button>
    </form>
  );
}

describe('CampoOrigem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useTenant as any).mockReturnValue({ activeTenantId: 't1' });
    (OrigensService.ler as any).mockResolvedValue(origensPadrao);
  });

  it('lista as origens da conta e mostra o lápis só com podeEditar (T10)', async () => {
    const { unmount } = render(<Formulario inicial="WhatsApp" podeEditar />);
    const campo = await screen.findByRole('combobox', { name: 'Origem' });
    for (const nome of ['Indicação', 'WhatsApp', 'Instagram', 'Facebook', 'Outro']) {
      expect(within(campo).getByRole('option', { name: nome })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Editar origens' })).toBeInTheDocument();
    unmount();

    render(<Formulario inicial="WhatsApp" podeEditar={false} />);
    await screen.findByRole('combobox', { name: 'Origem' });
    expect(screen.queryByRole('button', { name: 'Editar origens' })).not.toBeInTheDocument();
  });

  it('origem do lead fora da lista continua selecionada, sem duplicar, e o envio a mantém (T11, RF-OR-07)', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="Panfleto" aoEnviar={aoEnviar} />);

    const campo = await screen.findByRole('combobox', { name: 'Origem' });
    await waitFor(() => expect(within(campo).getAllByRole('option')).toHaveLength(6));
    expect(campo).toHaveDisplayValue('Panfleto');
    expect(within(campo).getAllByRole('option', { name: 'Panfleto' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledTimes(1));
    expect(aoEnviar.mock.calls[0][0]).toEqual({ origem: 'Panfleto' });
  });

  it('origem que já está na lista não vira opção repetida', async () => {
    render(<Formulario inicial="Instagram" />);
    const campo = await screen.findByRole('combobox', { name: 'Origem' });
    await waitFor(() => expect(within(campo).getAllByRole('option')).toHaveLength(5));
    expect(within(campo).getAllByRole('option', { name: 'Instagram' })).toHaveLength(1);
  });

  it('lead do site: mostra o texto, sem combobox e sem lápis (T12, RF-OR-09)', async () => {
    render(<Formulario inicial="Google Ads" travado podeEditar />);
    expect(await screen.findByText('Google Ads')).toBeInTheDocument();
    expect(screen.getByText('Leads vindos do site não podem ter a origem alterada.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar origens' })).not.toBeInTheDocument();
  });

  it('falha ao ler a lista usa as 5 padrão, avisa e o cadastro segue (T15, RF-OR-10)', async () => {
    (OrigensService.ler as any).mockRejectedValue(new Error('rede'));
    const aoEnviar = vi.fn();
    render(<Formulario inicial="Facebook" aoEnviar={aoEnviar} />);

    expect(await screen.findByText('Não foi possível carregar suas origens. Mostrando as padrão.')).toBeInTheDocument();
    const campo = screen.getByRole('combobox', { name: 'Origem' });
    expect(within(campo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Indicação', 'WhatsApp', 'Instagram', 'Facebook', 'Outro',
    ]);

    await userEvent.selectOptions(campo, 'Outro');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledTimes(1));
    expect(aoEnviar.mock.calls[0][0]).toEqual({ origem: 'Outro' });
  });

  it('o lápis abre o diálogo e, ao salvar, a origem nova aparece no campo (T16, RF-OR-03)', async () => {
    (OrigensService.salvar as any).mockResolvedValue(origensSalvas);
    render(<Formulario inicial="Indicação" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Editar origens' }));
    const dialogo = screen.getByRole('dialog', { name: 'Origens' });
    await userEvent.type(within(dialogo).getByLabelText('Nova origem'), 'Feira');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Adicionar' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(OrigensService.salvar).toHaveBeenCalledWith(0, [...origensPadrao.itens, 'Feira'], 't1');
    const campo = screen.getByRole('combobox', { name: 'Origem' });
    expect(within(campo).getByRole('option', { name: 'Feira' })).toBeInTheDocument();
    expect(campo).toHaveDisplayValue('Indicação');
  });
});
