import { describe, it, expect } from 'vitest';
import { urlParaAbrir } from './destinoDaNotificacao';

// spec crm-funil-e-atividades-f3, D-F3-5. O worker abre data.url; sem url, /kanban.

const ORIGIN = 'https://crm.exemplo';

describe('url do clique da notificação', () => {
  it('abre data.url quando existir', () => {
    expect(urlParaAbrir({ url: '/kanban?lead=lead-1' }, ORIGIN)).toBe('https://crm.exemplo/kanban?lead=lead-1');
  });

  it('url absoluta permanece a url recebida', () => {
    expect(urlParaAbrir({ url: 'https://outro.exemplo/ficha' }, ORIGIN)).toBe('https://outro.exemplo/ficha');
  });

  it('sem url abre /kanban', () => {
    expect(urlParaAbrir(undefined, ORIGIN)).toBe('https://crm.exemplo/kanban');
    expect(urlParaAbrir(null, ORIGIN)).toBe('https://crm.exemplo/kanban');
    expect(urlParaAbrir({}, ORIGIN)).toBe('https://crm.exemplo/kanban');
    expect(urlParaAbrir({ url: '' }, ORIGIN)).toBe('https://crm.exemplo/kanban');
  });
});
