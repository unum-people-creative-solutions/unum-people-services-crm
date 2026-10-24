import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// termos-crm-v2: o rodapé aponta para a v2 dos termos de uso. campanha-pagina
// RF-C05: a privacidade vai à página vigente (/privacidade), não a uma versão fixa.
describe('Login — links dos termos', () => {
  it('Termos de uso na v2 e privacidade na página vigente', () => {
    const fonte = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(fonte).toContain('"https://unumpeople.com.br/termos/9824049f-1b1b-4391-b271-53230c69f9b9/v2"');
    expect(fonte).toContain('"https://unumpeople.com.br/privacidade"');
    expect(fonte).not.toContain('5558327c-6ee1-4549-8e1b-dc03fdae516a');
    expect(fonte).not.toMatch(/termos\/[0-9a-f-]+\/v1/);
  });
});
