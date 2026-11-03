import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from '../db/pool.js';
import { cents, isoDate } from './crud.js';

export interface PerfilFiscal {
  tipoRenda: 'clt' | 'autonomo' | 'mei' | 'aposentado' | 'outro';
  rendaMensalCents: number;
  dependentes: number;
  cadunico: boolean;
  pessoasFamilia: number;
  rendaFamiliarCents: number;
  mei: boolean;
  meiAtividade: 'comercio' | 'servicos' | 'comercio_servicos' | null;
  meiAbertura: string | null;
  carneLeao: boolean;
  declaraIr: boolean;
  /** false enquanto a pessoa não salvou o perfil (valores padrão). */
  preenchido: boolean;
}

const PADRAO: PerfilFiscal = {
  tipoRenda: 'clt',
  rendaMensalCents: 0,
  dependentes: 0,
  cadunico: false,
  pessoasFamilia: 1,
  rendaFamiliarCents: 0,
  mei: false,
  meiAtividade: null,
  meiAbertura: null,
  carneLeao: false,
  declaraIr: true,
  preenchido: false,
};

interface PerfilRow {
  tipo_renda: PerfilFiscal['tipoRenda'];
  renda_mensal_cents: number;
  dependentes: number;
  cadunico: boolean;
  pessoas_familia: number;
  renda_familiar_cents: number;
  mei: boolean;
  mei_atividade: PerfilFiscal['meiAtividade'];
  mei_abertura: string | null;
  carne_leao: boolean;
  declara_ir: boolean;
}

export async function carregarPerfil(pool: Pool, userId: string): Promise<PerfilFiscal> {
  const { rows } = await pool.query<PerfilRow>('SELECT * FROM fiscal_profiles WHERE user_id = $1', [userId]);
  const r = rows[0];
  if (!r) return { ...PADRAO };
  return {
    tipoRenda: r.tipo_renda,
    rendaMensalCents: r.renda_mensal_cents,
    dependentes: r.dependentes,
    cadunico: r.cadunico,
    pessoasFamilia: r.pessoas_familia,
    rendaFamiliarCents: r.renda_familiar_cents,
    mei: r.mei,
    meiAtividade: r.mei_atividade,
    meiAbertura: r.mei_abertura,
    carneLeao: r.carne_leao,
    declaraIr: r.declara_ir,
    preenchido: true,
  };
}

const body = z
  .object({
    tipoRenda: z.enum(['clt', 'autonomo', 'mei', 'aposentado', 'outro']),
    rendaMensalCents: cents,
    dependentes: z.number().int().min(0).max(20),
    cadunico: z.boolean(),
    pessoasFamilia: z.number().int().min(1).max(30),
    rendaFamiliarCents: cents,
    mei: z.boolean(),
    meiAtividade: z.enum(['comercio', 'servicos', 'comercio_servicos']).nullable(),
    meiAbertura: isoDate.nullable(),
    carneLeao: z.boolean(),
    declaraIr: z.boolean(),
  })
  .partial();

export async function perfilRoutes(app: FastifyInstance) {
  const { pool } = app.deps;
  app.addHook('onRequest', app.authenticate);

  app.get('/perfil-fiscal', async (req) => ({ perfil: await carregarPerfil(pool, req.user.sub) }));

  /** Atualização parcial: o que não vier no corpo continua como estava. */
  app.put('/perfil-fiscal', async (req) => {
    const b = body.parse(req.body);
    const p = { ...(await carregarPerfil(pool, req.user.sub)), ...b };
    if (p.mei && !p.meiAtividade) p.meiAtividade = 'servicos';
    await pool.query(
      `INSERT INTO fiscal_profiles (user_id, tipo_renda, renda_mensal_cents, dependentes, cadunico, pessoas_familia,
         renda_familiar_cents, mei, mei_atividade, mei_abertura, carne_leao, declara_ir)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id) DO UPDATE SET tipo_renda = EXCLUDED.tipo_renda, renda_mensal_cents = EXCLUDED.renda_mensal_cents,
         dependentes = EXCLUDED.dependentes, cadunico = EXCLUDED.cadunico, pessoas_familia = EXCLUDED.pessoas_familia,
         renda_familiar_cents = EXCLUDED.renda_familiar_cents, mei = EXCLUDED.mei, mei_atividade = EXCLUDED.mei_atividade,
         mei_abertura = EXCLUDED.mei_abertura, carne_leao = EXCLUDED.carne_leao, declara_ir = EXCLUDED.declara_ir, updated_at = now()`,
      [req.user.sub, p.tipoRenda, p.rendaMensalCents, p.dependentes, p.cadunico, p.pessoasFamilia, p.rendaFamiliarCents,
        p.mei, p.meiAtividade, p.meiAbertura, p.carneLeao, p.declaraIr],
    );
    return { perfil: await carregarPerfil(pool, req.user.sub) };
  });
}
