import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// termos-crm-v2: o rodapé do login aponta para a v2 dos dois termos.
describe('Login — links dos termos', () => {
  it('Termos de Uso e Política de Privacidade na v2', () => {
    const fonte = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
    expect(fonte).toContain('"https://unumpeople.com.br/termos/9824049f-1b1b-4391-b271-53230c69f9b9/v2"');
    expect(fonte).toContain('"https://unumpeople.com.br/termos/5558327c-6ee1-4549-8e1b-dc03fdae516a/v2"');
    expect(fonte).not.toMatch(/termos\/[0-9a-f-]+\/v1/);
  });
});
