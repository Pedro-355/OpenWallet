/**
 * Assistente tributário: busca nos trechos da lei e nos guias (BM25 simples, sem dependências)
 * e monta a resposta. Com uma chave de API configurada, um modelo de linguagem redige a resposta
 * usando só os trechos encontrados; sem chave, respondemos com o guia mais relevante.
 */

export interface Trecho {
  id: string;
  fonte: string;
  titulo: string;
  texto: string;
  palavras?: string[];
}

export interface Corpus {
  versao: string;
  aviso: string;
  trechos: Trecho[];
}

const STOP_RAW =
  'a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem e ou que se ao aos à às é ser foi são eu meu minha meus minhas voce você seu sua isso esse essa este esta como qual quais quando onde quanto quanta tem ter tenho preciso posso pode mais menos muito já não nao sim me te lhe';

export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STOP = new Set(normalizar(STOP_RAW).split(' '));

export function tokens(s: string): string[] {
  return normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t)); // plural simples
}

export interface Resultado {
  trecho: Trecho;
  score: number;
}

/** BM25 (k1=1,2; b=0,75). Título e palavras-chave pesam mais que o corpo do texto. */
export function buscar(corpus: Corpus, pergunta: string, k = 4): Resultado[] {
  const q = [...new Set(tokens(pergunta))];
  if (!q.length) return [];
  const docs = corpus.trechos.map((t) => {
    const extra = [t.titulo, t.titulo, ...(t.palavras ?? []), ...(t.palavras ?? [])].join(' ');
    return tokens(`${extra} ${t.texto}`);
  });
  const N = docs.length;
  const media = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, N);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

  const k1 = 1.2;
  const b = 0.75;
  return docs
    .map((d, i) => {
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const n = df.get(t)!;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / media)));
      }
      return { trecho: corpus.trechos[i]!, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}

export interface RespostaAssistente {
  resposta: string;
  fontes: { id: string; fonte: string; titulo: string }[];
  modo: 'modelo' | 'busca';
  aviso: string;
}

/** Resposta sem modelo de linguagem: o trecho mais relevante, com as fontes. */
export function respostaLocal(corpus: Corpus, achados: Resultado[]): RespostaAssistente {
  if (!achados.length) {
    return {
      resposta:
        'Não encontrei nada sobre isso na base do app. Tente com outras palavras (ex.: "MEI limite", "malha fina", "cashback") ou fale com um contador pela aba Ajuda.',
      fontes: [],
      modo: 'busca',
      aviso: corpus.aviso,
    };
  }
  const [melhor, ...outros] = achados;
  const resposta = [`${melhor!.trecho.titulo}: ${melhor!.trecho.texto}`, ...(outros.length ? ['Veja também: ' + outros.map((o) => o.trecho.titulo).join('; ') + '.'] : [])].join('\n\n');
  return {
    resposta,
    fontes: achados.map((a) => ({ id: a.trecho.id, fonte: a.trecho.fonte, titulo: a.trecho.titulo })),
    modo: 'busca',
    aviso: corpus.aviso,
  };
}

/** Instruções para o modelo: responder só com base nos trechos, em português simples, citando as fontes. */
export function montarPrompt(pergunta: string, achados: Resultado[]): { system: string; user: string } {
  const system = [
    'Você é o assistente tributário do OpenWallet, para pessoas físicas e MEIs no Brasil.',
    'Responda em português do Brasil, simples e direto, em até 6 frases.',
    'Use SOMENTE as informações dos trechos fornecidos. Se eles não respondem, diga que não sabe e sugira falar com um contador.',
    'Cite a fonte entre colchetes com o id do trecho, por exemplo [ctn-168].',
    'Não dê recomendação de investimento nem garanta resultados; valores de 2027 em diante são estimativas quando o trecho disser.',
  ].join(' ');
  const user = `Trechos:\n${achados.map((a) => `[${a.trecho.id}] ${a.trecho.fonte} — ${a.trecho.titulo}: ${a.trecho.texto}`).join('\n')}\n\nPergunta: ${pergunta}`;
  return { system, user };
}
