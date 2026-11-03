-- MVP: perfil fiscal, notas lidas (NFC-e), pasta do IR, agenda, créditos a receber, MEI e contadores.

-- Perfil fiscal: o que o app precisa saber para personalizar IR, cashback, agenda e MEI.
CREATE TABLE fiscal_profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tipo_renda           text NOT NULL DEFAULT 'clt' CHECK (tipo_renda IN ('clt', 'autonomo', 'mei', 'aposentado', 'outro')),
  renda_mensal_cents   bigint NOT NULL DEFAULT 0 CHECK (renda_mensal_cents >= 0),
  dependentes          integer NOT NULL DEFAULT 0 CHECK (dependentes BETWEEN 0 AND 20),
  cadunico             boolean NOT NULL DEFAULT false,
  pessoas_familia      integer NOT NULL DEFAULT 1 CHECK (pessoas_familia BETWEEN 1 AND 30),
  renda_familiar_cents bigint NOT NULL DEFAULT 0 CHECK (renda_familiar_cents >= 0),
  mei                  boolean NOT NULL DEFAULT false,
  mei_atividade        text CHECK (mei_atividade IN ('comercio', 'servicos', 'comercio_servicos')),
  mei_abertura         date,
  carne_leao           boolean NOT NULL DEFAULT false,
  declara_ir           boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Gastos vindos de nota fiscal lida pelo QR code.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_source_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_source_check CHECK (source IN ('manual', 'openfinance', 'nfce'));
-- CPF na nota: true/false quando sabemos (nota lida); null quando não (lançado à mão, cartão).
ALTER TABLE expenses ADD COLUMN cpf_na_nota boolean;

CREATE TABLE nfce_reads (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chave          char(44) NOT NULL,
  uf             char(2) NOT NULL,
  emitente_cnpj  char(14) NOT NULL,
  emitente_nome  text NOT NULL DEFAULT '',
  emitida_em     date NOT NULL,
  valor_cents    bigint NOT NULL CHECK (valor_cents > 0),
  cpf_na_nota    boolean,
  itens          jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chave)
);
CREATE INDEX nfce_reads_user_date_idx ON nfce_reads (user_id, emitida_em DESC);

-- Pasta do IR: recibos dedutíveis guardados ao longo do ano.
CREATE TABLE ir_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('saude', 'educacao', 'previdencia_privada', 'pensao_alimenticia', 'outro')),
  valor_cents    bigint NOT NULL CHECK (valor_cents > 0),
  pago_em        date NOT NULL,
  prestador_nome text NOT NULL,
  prestador_doc  text,
  beneficiario   text NOT NULL DEFAULT 'Titular',
  descricao      text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ir_documents_user_idx ON ir_documents (user_id, pago_em DESC);

-- Rendimentos (para IR, carnê-leão, impostômetro anual e faturamento do MEI).
CREATE TABLE incomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('salario', 'autonomo_pf', 'autonomo_pj', 'aluguel', 'mei', 'outro')),
  valor_cents     bigint NOT NULL CHECK (valor_cents > 0),
  recebido_em     date NOT NULL,
  pagador_nome    text NOT NULL DEFAULT '',
  pagador_doc     text,
  ir_retido_cents bigint NOT NULL DEFAULT 0 CHECK (ir_retido_cents >= 0),
  inss_cents      bigint NOT NULL DEFAULT 0 CHECK (inss_cents >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incomes_user_idx ON incomes (user_id, recebido_em DESC);

-- Agenda: obrigações avulsas (IPVA, IPTU...) e pagamentos das recorrentes (DAS, carnê-leão).
CREATE TABLE obligations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN ('das_mei', 'dasn_simei', 'carne_leao', 'dirpf', 'ipva', 'iptu', 'outro')),
  titulo              text NOT NULL,
  vencimento          date NOT NULL,
  competencia         text,
  valor_cents         bigint CHECK (valor_cents IS NULL OR valor_cents >= 0),
  desconto_avista_pct numeric(5,2),
  parcelas            integer CHECK (parcelas IS NULL OR parcelas BETWEEN 1 AND 24),
  pago_em             date,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX obligations_user_idx ON obligations (user_id, vencimento);
-- Uma recorrente (ex.: DAS de out/2026) só é marcada como paga uma vez.
CREATE UNIQUE INDEX obligations_recorrente_uq ON obligations (user_id, tipo, competencia) WHERE competencia IS NOT NULL;

-- Dinheiro a receber: restituição, programas de nota fiscal, valores esquecidos, cashback.
CREATE TABLE credits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origem        text NOT NULL CHECK (origem IN ('restituicao_ir', 'nota_fiscal_estadual', 'valores_a_receber', 'cashback', 'outro')),
  descricao     text NOT NULL DEFAULT '',
  valor_cents   bigint NOT NULL CHECK (valor_cents > 0),
  previsto_para date,
  status        text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'recebido')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credits_user_idx ON credits (user_id, created_at DESC);

-- Notas de serviço emitidas pelo MEI (NFS-e).
CREATE TABLE mei_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  numero       bigint NOT NULL,
  chave        text NOT NULL,
  tomador_nome text NOT NULL,
  tomador_doc  text,
  descricao    text NOT NULL,
  valor_cents  bigint NOT NULL CHECK (valor_cents > 0),
  emitida_em   date NOT NULL,
  status       text NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'cancelada')),
  provider     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, numero)
);

-- Marketplace de contadores.
CREATE TABLE accountants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  text NOT NULL,
  crc                   text NOT NULL,
  uf                    char(2) NOT NULL,
  cidade                text NOT NULL,
  especialidades        text[] NOT NULL DEFAULT '{}',
  preco_consulta_cents  bigint NOT NULL,
  atende_online         boolean NOT NULL DEFAULT true,
  -- true = cadastro de exemplo do ambiente de teste (aparece com selo "Exemplo")
  exemplo               boolean NOT NULL DEFAULT false,
  ativo                 boolean NOT NULL DEFAULT true
);

CREATE TABLE accountant_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accountant_id uuid NOT NULL REFERENCES accountants(id),
  assunto       text NOT NULL,
  mensagem      text NOT NULL,
  status        text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'respondido', 'fechado')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accountant_leads_user_idx ON accountant_leads (user_id, created_at DESC);

-- Cadastros de exemplo (fictícios) para o ambiente de teste. Só aparecem com MOSTRAR_EXEMPLOS.
INSERT INTO accountants (nome, crc, uf, cidade, especialidades, preco_consulta_cents, exemplo) VALUES
  ('Escritório Exemplo Centro (fictício)', 'SP-000000/O-0', 'SP', 'São Paulo', '{irpf,malha_fina,carne_leao}', 15000, true),
  ('Contabilidade Exemplo MEI (fictício)', 'RJ-000000/O-0', 'RJ', 'Rio de Janeiro', '{mei,abertura_empresa,simples_nacional}', 9900, true),
  ('Consultoria Exemplo Online (fictício)', 'MG-000000/O-0', 'MG', 'Belo Horizonte', '{irpf,mei,dividas,simples_nacional}', 12000, true);
