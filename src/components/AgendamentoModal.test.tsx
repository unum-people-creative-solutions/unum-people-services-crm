import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgendamentoModal } from './AgendamentoModal';

// spec crm-agendamento-e-lembretes, CA-52; blueprint §2 (textos literais).
// "agora" = 2026-11-10T15:00:00Z (12:00 em Brasília); o vitest roda com TZ=America/Sao_Paulo.

// O framer-motion é trocado por um div que guarda as props de animação da folha,
// para conferir a variante escolhida já no primeiro render (celular x desktop).
const animacao = vi.hoisted(() => ({ dialogo: [] as { initial: unknown; animate: unknown }[] }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, exit, transition, drag, dragConstraints, dragElastic, onDragEnd, ...props }: any) => {
      if (props.role === 'dialog') animacao.dialogo.push({ initial, animate });
      return <div {...props}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

type Props = Parameters<typeof AgendamentoModal>[0];

function montar(over: Partial<Props> = {}) {
  const props: Props = {
    aberto: true,
    modo: 'mover',
    nomeDoLead: 'Maria Silva',
    enviando: false,
    erro: null,
    onConfirmar: vi.fn(),
    onCancelar: vi.fn(),
    ...over,
  };
  const r = render(<AgendamentoModal {...props} />);
  return { ...r, props };
}

const texto = (el: Element | null) => el?.textContent;

describe('AgendamentoModal (CA-52)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('modo mover: dialog "Agendar horário", foco em Data e os textos exatos do blueprint §2.2', () => {
    montar();
    const dialog = screen.getByRole('dialog', { name: 'Agendar horário' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Data')).toHaveFocus();

    expect(texto(screen.getByRole('heading', { level: 2 }))).toBe('Agendar horário');
    expect(texto(screen.getByText('Maria Silva'))).toBe('Maria Silva');
    const fuso = screen.getByText('Data e hora no horário de Brasília.');
    expect(texto(fuso)).toBe('Data e hora no horário de Brasília.');
    expect(dialog.getAttribute('aria-describedby')).toBe(fuso.id);
    expect(texto(screen.getByText(/^Uma hora antes/))).toBe(
      'Uma hora antes, quem tem as notificações ligadas recebe um lembrete.',
    );
    expect(texto(screen.getByRole('button', { name: 'Confirmar agendamento' }))).toBe('Confirmar agendamento');
    expect(texto(screen.getByRole('button', { name: 'Cancelar movimento' }))).toBe('Cancelar movimento');
  });

  it('campos: date com min/max em Brasília, time, required e ids próprios', () => {
    montar();
    const data = screen.getByLabelText('Data');
    const hora = screen.getByLabelText('Hora');
    expect(data).toHaveAttribute('type', 'date');
    expect(data).toHaveAttribute('id', 'agendamento-data');
    expect(data).toHaveAttribute('min', '2026-11-10');
    expect(data).toHaveAttribute('max', '2027-11-10');
    expect(data).toBeRequired();
    expect(hora).toHaveAttribute('type', 'time');
    expect(hora).toHaveAttribute('id', 'agendamento-hora');
    expect(hora).toBeRequired();
  });

  it('min da data é o dia de Brasília, não o de UTC (23:30 de 10/11 em Brasília = 02:30Z de 11/11)', () => {
    vi.setSystemTime(new Date('2026-11-11T02:30:00Z'));
    montar();
    expect(screen.getByLabelText('Data')).toHaveAttribute('min', '2026-11-10');
  });

  it('confirmar vazio → "Informe a data." e "Informe a hora.", aria-invalid nos dois, nenhum onConfirmar', () => {
    const { props } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const data = screen.getByLabelText('Data');
    const hora = screen.getByLabelText('Hora');
    expect(data).toHaveAttribute('aria-invalid', 'true');
    expect(hora).toHaveAttribute('aria-invalid', 'true');
    expect(texto(document.getElementById(data.getAttribute('aria-describedby') as string))).toBe('Informe a data.');
    expect(texto(document.getElementById(hora.getAttribute('aria-describedby') as string))).toBe('Informe a hora.');
    expect(props.onConfirmar).not.toHaveBeenCalled();
  });

  it('horário igual a agora → "Escolha um horário a partir de agora." no campo Hora', () => {
    const { props } = montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const hora = screen.getByLabelText('Hora');
    expect(hora).toHaveAttribute('aria-invalid', 'true');
    expect(texto(document.getElementById(hora.getAttribute('aria-describedby') as string))).toBe(
      'Escolha um horário a partir de agora.',
    );
    expect(screen.getByLabelText('Data')).not.toHaveAttribute('aria-invalid', 'true');
    expect(props.onConfirmar).not.toHaveBeenCalled();
  });

  it('mais de 12 meses → "Escolha uma data nos próximos 12 meses." no campo Data', () => {
    const { props } = montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2027-11-10' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '12:01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    const data = screen.getByLabelText('Data');
    expect(data).toHaveAttribute('aria-invalid', 'true');
    expect(texto(document.getElementById(data.getAttribute('aria-describedby') as string))).toBe(
      'Escolha uma data nos próximos 12 meses.',
    );
    expect(props.onConfirmar).not.toHaveBeenCalled();
  });

  it('válido → onConfirmar com o instante em UTC (15:30 de Brasília = 18:30Z)', () => {
    const { props } = montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '15:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(props.onConfirmar).toHaveBeenCalledTimes(1);
    expect(props.onConfirmar).toHaveBeenCalledWith('2026-11-12T18:30:00Z');
  });

  it('dica de menos de uma hora com os dois campos para 30 min à frente', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '12:30' } });
    expect(texto(screen.getByText(/^Faltam menos de uma hora/))).toBe(
      'Faltam menos de uma hora: não haverá lembrete por notificação.',
    );
    expect(screen.queryByText(/^Uma hora antes/)).not.toBeInTheDocument();
  });

  it('com 1h ou mais de antecedência, fica a dica padrão', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '13:00' } });
    expect(screen.getByText(/^Uma hora antes/)).toBeInTheDocument();
    expect(screen.queryByText(/^Faltam menos de uma hora/)).not.toBeInTheDocument();
  });

  it('editar um campo depois do erro tira os avisos antigos (o horário é a combinação dos dois)', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2027-11-10' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '12:01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(screen.getByText('Escolha uma data nos próximos 12 meses.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-10' } });
    expect(screen.queryByText('Escolha uma data nos próximos 12 meses.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data')).not.toHaveAttribute('aria-invalid');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(screen.getByText('Informe a hora.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-11' } });
    expect(screen.queryByText('Informe a hora.')).not.toBeInTheDocument();
  });

  it('Esc → onCancelar uma vez', () => {
    const { props } = montar();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(props.onCancelar).toHaveBeenCalledTimes(1);
  });

  it('botão secundário e clique no fundo → onCancelar; clique dentro do cartão não cancela', () => {
    const { props } = montar();
    fireEvent.click(screen.getByRole('dialog'));
    expect(props.onCancelar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar movimento' }));
    expect(props.onCancelar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('agendamento-fundo'));
    expect(props.onCancelar).toHaveBeenCalledTimes(2);
  });

  it('Tab a partir do último botão volta ao campo Data; Shift+Tab no Data vai ao último', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    montar();
    const ultimo = screen.getByRole('button', { name: 'Cancelar movimento' });
    act(() => ultimo.focus());
    await user.tab();
    expect(screen.getByLabelText('Data')).toHaveFocus();
    await user.tab({ shift: true });
    expect(ultimo).toHaveFocus();
  });

  it('enviando: botão principal "Salvando…", disabled, aria-busy, e Esc não cancela', () => {
    const { props } = montar({ enviando: true });
    const principal = screen.getByRole('button', { name: 'Salvando…' });
    expect(texto(principal)).toBe('Salvando…');
    expect(principal).toBeDisabled();
    expect(principal).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Confirmar agendamento' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('agendamento-fundo'));
    expect(props.onCancelar).not.toHaveBeenCalled();
  });

  it('modo alterar: título "Alterar horário", botões "Salvar horário" e "Cancelar"', () => {
    montar({ modo: 'alterar' });
    expect(screen.getByRole('dialog', { name: 'Alterar horário' })).toBeInTheDocument();
    expect(texto(screen.getByRole('heading', { level: 2 }))).toBe('Alterar horário');
    expect(texto(screen.getByRole('button', { name: 'Salvar horário' }))).toBe('Salvar horário');
    expect(texto(screen.getByRole('button', { name: 'Cancelar' }))).toBe('Cancelar');
  });

  it('valorInicial preenche data e hora em Brasília', () => {
    montar({ modo: 'alterar', valorInicial: '2026-11-06T01:30:00Z' });
    expect(screen.getByLabelText('Data')).toHaveValue('2026-11-05');
    expect(screen.getByLabelText('Hora')).toHaveValue('22:30');
  });

  it('erro do servidor em role="alert", com o modal aberto e os valores digitados', () => {
    const { rerender, props } = montar();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '15:30' } });
    rerender(<AgendamentoModal {...props} erro="Não foi possível salvar o horário. Tente de novo." />);
    expect(texto(screen.getByRole('alert'))).toBe('Não foi possível salvar o horário. Tente de novo.');
    expect(screen.getByRole('dialog', { name: 'Agendar horário' })).toBeInTheDocument();
    expect(screen.getByLabelText('Data')).toHaveValue('2026-11-12');
    expect(screen.getByLabelText('Hora')).toHaveValue('15:30');
    expect(screen.getByRole('button', { name: 'Confirmar agendamento' })).toBeEnabled();
  });

  it('o nome do lead entra como texto, nunca como HTML', () => {
    montar({ nomeDoLead: '<b>Maria</b>' });
    expect(screen.getByText('<b>Maria</b>')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('b')).toBeNull();
  });

  describe('variante da folha no primeiro render (a animação não pode trocar no meio)', () => {
    const larguraOriginal = window.innerWidth;
    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: larguraOriginal });
    });

    it('a 375px já nasce como folha de baixo (y: 100%), sem passar pela variante do desktop', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
      animacao.dialogo = [];
      montar();
      expect(animacao.dialogo[0]).toEqual({ initial: { y: '100%' }, animate: { y: 0 } });
    });

    it('a 1280px nasce como cartão central', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      animacao.dialogo = [];
      montar();
      expect(animacao.dialogo[0]).toEqual({ initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 } });
    });
  });

  it('fechado, não renderiza nada; ao fechar, o foco volta ao elemento de antes', () => {
    const botao = document.createElement('button');
    botao.textContent = 'Alterar horário';
    document.body.appendChild(botao);
    botao.focus();
    const { rerender, props } = montar();
    expect(screen.getByLabelText('Data')).toHaveFocus();
    rerender(<AgendamentoModal {...props} aberto={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
    botao.remove();
  });
});
