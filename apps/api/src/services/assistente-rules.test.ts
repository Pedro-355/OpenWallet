import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buscar, montarPrompt, normalizar, respostaLocal, tokens, type Corpus } from './assistente-rules.js';

const corpus = JSON.parse(readFileSync(new URL('../../data/assistente.json', import.meta.url), 'utf8')) as Corpus;

describe('normalização', () => {
  it('tira acentos e maiúsculas', () => {
    expect(normalizar('Restituição ÀS')).toBe('restituicao as');
  });

  it('remove palavras vazias e plural simples', () => {
    expect(tokens('Quais são os prazos das declarações?')).toEqual(['prazo', 'declaracoe']);
  });
});

describe('busca na base do assistente', () => {
  it.each([
    ['Qual o prazo para pedir restituição de imposto pago a mais?', 'ctn-168'],
    ['Quanto o MEI pode faturar por ano?', 'guia-mei'],
    ['Como evitar cair na malha fina?', 'guia-malha'],
    ['Quem tem direito ao cashback do CadÚnico?', 'guia-cashback'],
    ['Vale a pena pagar o IPVA à vista?', 'guia-ipva-iptu'],
    ['Esqueci de pagar o carnê-leão do aluguel', 'guia-carne-leao'],
    ['Ganho 4.500 por mês, pago imposto de renda?', 'guia-ir-2026'],
  ])('"%s" encontra %s entre os primeiros', (pergunta, id) => {
    const ids = buscar(corpus, pergunta, 3).map((r) => r.trecho.id);

    expect(ids).toContain(id);
  });

  it('pergunta sem palavras úteis não encontra nada', () => {
    expect(buscar(corpus, 'o que é isso?')).toEqual([]);
    expect(buscar(corpus, 'xyzzy')).toEqual([]);
  });

  it('respeita o limite de resultados', () => {
    expect(buscar(corpus, 'imposto renda declaração restituição', 2)).toHaveLength(2);
  });

  it('funciona com base vazia', () => {
    expect(buscar({ versao: 'v', aviso: '', trechos: [] }, 'imposto')).toEqual([]);
  });
});

describe('respostas', () => {
  it('resposta local traz o melhor trecho e as fontes', () => {
    const achados = buscar(corpus, 'limite do MEI e DAS', 3);
    const r = respostaLocal(corpus, achados);

    expect(r.modo).toBe('busca');
    expect(r.resposta.startsWith(achados[0]!.trecho.titulo)).toBe(true);
    expect(r.resposta).toContain('Veja também');
    expect(r.fontes).toHaveLength(achados.length);
  });

  it('com um único trecho não mostra "veja também"', () => {
    const r = respostaLocal(corpus, buscar(corpus, 'limite do MEI', 1));

    expect(r.resposta).not.toContain('Veja também');
  });

  it('sem trechos sugere reformular ou falar com um contador', () => {
    expect(respostaLocal(corpus, []).resposta).toMatch(/contador/);
  });

  it('o prompt do modelo inclui os trechos com id e a pergunta', () => {
    const p = montarPrompt('prazo restituição?', buscar(corpus, 'prazo restituição', 2));

    expect(p.system).toMatch(/SOMENTE/);
    expect(p.user).toMatch(/\[ctn-168\]/);
    expect(p.user).toMatch(/Pergunta: prazo restituição\?$/);
  });
});
