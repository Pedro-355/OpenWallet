#!/usr/bin/env node
/**
 * Gera packages/tax/data/rates.json a partir das tabelas IBPT (uma CSV por UF).
 *
 * Uso:
 *   node scripts/import-ibpt.mjs <pasta-com-csvs> [--version 26.2.A]
 *   node scripts/import-ibpt.mjs --illustrative      # gera valores de exemplo (não oficiais)
 *
 * Os CSVs são os do portal De Olho no Imposto (deolhonoimposto.ibpt.org.br),
 * nomeados como "TabelaIBPTaxSP26.2.A.csv". O separador é ";" e a codificação
 * costuma ser latin1 — o script detecta as duas.
 *
 * Para cada categoria de packages/tax/data/categories.json, o script tira a
 * média das alíquotas dos códigos que casam com os prefixos, por UF.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const categoriesPath = join(root, 'packages/tax/data/categories.json');
const outPath = join(root, 'packages/tax/data/rates.json');

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const args = process.argv.slice(2);
const config = JSON.parse(readFileSync(categoriesPath, 'utf8'));
const round2 = (n) => Math.round(n * 100) / 100;
const digits = (s) => String(s).replace(/\D/g, '');

if (args.includes('--illustrative')) {
  const categories = {};
  for (const [key, c] of Object.entries(config.categories)) {
    const il = c.ilustrativo;
    categories[key] = {
      label: c.label,
      federal: il.federal,
      ...(il.municipal ? { municipal: il.municipal } : {}),
      estadual: {},
      estadualPadrao: il.estadual,
    };
  }
  write({
    version: 'ilustrativo-1',
    source: 'Valores ilustrativos — rode a importação do IBPT antes de usar em produção',
    illustrative: true,
    fallbackCategory: config.fallbackCategory,
    categories,
  });
  process.exit(0);
}

const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Uso: node scripts/import-ibpt.mjs <pasta-com-csvs> [--version X] | --illustrative');
  process.exit(1);
}
const versionArg = args.includes('--version') ? args[args.indexOf('--version') + 1] : undefined;

function readCsv(path) {
  const buf = readFileSync(path);
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split(';').map((h) => h.trim().toLowerCase());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${path}: coluna "${name}" não encontrada`);
    return i;
  };
  const idx = {
    codigo: col('codigo'), ex: col('ex'), tipo: col('tipo'),
    federal: col('nacionalfederal'), estadual: col('estadual'), municipal: col('municipal'),
    versao: header.indexOf('versao'),
  };
  const num = (v) => Number(String(v ?? '0').replace(',', '.')) || 0;
  return lines.map((line) => {
    const c = line.split(';');
    return {
      codigo: digits(c[idx.codigo]),
      ex: (c[idx.ex] ?? '').trim(),
      tipo: (c[idx.tipo] ?? '').trim(),
      federal: num(c[idx.federal]),
      estadual: num(c[idx.estadual]),
      municipal: num(c[idx.municipal]),
      versao: idx.versao >= 0 ? (c[idx.versao] ?? '').trim() : '',
    };
  });
}

const files = readdirSync(dir).filter((f) => /\.csv$/i.test(f));
const byUf = new Map();
let detectedVersion = '';
for (const f of files) {
  const m = f.match(/IBPTax([A-Z]{2})/i);
  const uf = m?.[1]?.toUpperCase();
  if (!uf || !UFS.includes(uf)) {
    console.warn(`Ignorando ${f}: não identifiquei a UF pelo nome`);
    continue;
  }
  const rows = readCsv(join(dir, f)).filter((r) => r.ex === '' || r.ex === '0');
  byUf.set(uf, rows);
  detectedVersion ||= rows.find((r) => r.versao)?.versao ?? '';
}
if (byUf.size === 0) {
  console.error('Nenhuma tabela IBPT encontrada na pasta.');
  process.exit(1);
}
const missing = UFS.filter((uf) => !byUf.has(uf));
if (missing.length) console.warn(`Atenção: faltam UFs (${missing.join(', ')}); elas usarão a média nacional.`);

const categories = {};
const report = [];
for (const [key, c] of Object.entries(config.categories)) {
  const matches = (r) =>
    c.match.some((m) => r.tipo === m.tipo && m.prefixos.some((p) => r.codigo.startsWith(digits(p))));

  const estadual = {};
  let fedSum = 0, munSum = 0, n = 0;
  const estAll = [];
  for (const [uf, rows] of byUf) {
    const hit = rows.filter(matches);
    if (!hit.length) continue;
    const avg = (k) => hit.reduce((s, r) => s + r[k], 0) / hit.length;
    estadual[uf] = round2(avg('estadual'));
    estAll.push(estadual[uf]);
    fedSum += avg('federal');
    munSum += avg('municipal');
    n++;
    if (uf === 'SP' || n === 1) report.push(`${key.padEnd(12)} ${uf}: ${hit.length} códigos`);
  }
  if (n === 0) {
    console.warn(`Categoria "${key}" não casou com nenhum código — mantendo valores ilustrativos.`);
    const il = c.ilustrativo;
    categories[key] = { label: c.label, federal: il.federal, municipal: il.municipal ?? 0, estadual: {}, estadualPadrao: il.estadual };
    continue;
  }
  categories[key] = {
    label: c.label,
    federal: round2(fedSum / n),
    municipal: round2(munSum / n),
    estadual,
    estadualPadrao: round2(estAll.reduce((a, b) => a + b, 0) / estAll.length),
  };
}

const version = versionArg && !versionArg.startsWith('--') ? versionArg : detectedVersion || 'ibpt';
write({
  version: `ibpt-${version}`,
  source: `IBPT / De Olho no Imposto, tabela ${version} — médias por categoria`,
  illustrative: false,
  fallbackCategory: config.fallbackCategory,
  categories,
});
console.log(report.join('\n'));

function write(table) {
  writeFileSync(outPath, JSON.stringify(table, null, 2) + '\n');
  console.log(`Gravado ${outPath} (versão ${table.version})`);
}
