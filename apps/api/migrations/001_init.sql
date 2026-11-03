-- Usuários
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  uf            char(2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

-- Sessões (refresh tokens). Guardamos só o hash do token.
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sessions_token_hash_uq ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Gastos, particionados por hash do usuário.
-- Todas as consultas filtram por user_id, então cada consulta toca uma só partição.
-- Com muitos usuários, isso mantém índices menores e permite VACUUM/manutenção por partição.
CREATE TABLE expenses (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000000),
  category         text NOT NULL,
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  uf               char(2) NOT NULL,
  spent_on         date NOT NULL,
  -- Foto do imposto no momento do lançamento (não muda se a tabela IBPT mudar depois).
  tax_federal_cents   bigint NOT NULL,
  tax_estadual_cents  bigint NOT NULL,
  tax_municipal_cents bigint NOT NULL,
  tax_total_cents     bigint NOT NULL,
  tax_rate_pct        numeric(5,2) NOT NULL,
  rates_version       text NOT NULL,
  idempotency_key     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (tax_total_cents = tax_federal_cents + tax_estadual_cents + tax_municipal_cents),
  CHECK (tax_total_cents <= amount_cents)
) PARTITION BY HASH (user_id);

DO $$
BEGIN
  FOR i IN 0..15 LOOP
    EXECUTE format(
      'CREATE TABLE expenses_p%s PARTITION OF expenses FOR VALUES WITH (MODULUS 16, REMAINDER %s)',
      i, i);
  END LOOP;
END $$;

-- Listagem paginada (keyset) e resumo mensal.
CREATE INDEX expenses_user_spent_idx ON expenses (user_id, spent_on DESC, id DESC);
-- Reenvio do mesmo POST (rede ruim no celular) não duplica o gasto.
CREATE UNIQUE INDEX expenses_idempotency_uq ON expenses (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
