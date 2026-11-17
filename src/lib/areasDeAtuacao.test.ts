import { describe, it, expect } from 'vitest';
import { AREAS_DE_ATUACAO } from './areasDeAtuacao';

// RF-AA-01: lista literal, nesta ordem.
describe('AREAS_DE_ATUACAO', () => {
  it('é a lista literal da spec, na ordem', () => {
    expect([...AREAS_DE_ATUACAO]).toEqual([
      'Saúde',
      'Beleza e estética',
      'Bem-estar e esporte',
      'Alimentação',
      'Comércio e lojas',
      'Serviços para casa',
      'Serviços profissionais',
      'Educação e cursos',
      'Tecnologia e marketing',
      'Imóveis',
      'Automotivo',
      'Eventos e fotografia',
      'Outro',
    ]);
  });
});
