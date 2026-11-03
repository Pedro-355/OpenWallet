-- Origem dos gastos: lançados à mão ou importados do Open Finance.
ALTER TABLE expenses ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'openfinance'));
ALTER TABLE expenses ADD COLUMN external_id text;
ALTER TABLE expenses ADD COLUMN connection_id uuid;
ALTER TABLE expenses ADD COLUMN mcc integer;
-- A mesma transação do banco nunca vira dois gastos, mesmo com webhook repetido.
CREATE UNIQUE INDEX expenses_external_uq ON expenses (user_id, external_id)
  WHERE external_id IS NOT NULL;

-- Gastos importados que o usuário apagou: a próxima sincronização não os traz de volta.
CREATE TABLE expense_tombstones (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  deleted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, external_id)
);

-- Conexões com instituições (um consentimento cada).
CREATE TABLE bank_connections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  consent_id   text NOT NULL,
  state        text NOT NULL,
  institution  text NOT NULL,
  status       text NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'revoked', 'error')),
  last_sync_at timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bank_connections_consent_uq ON bank_connections (provider, consent_id);
CREATE INDEX bank_connections_user_idx ON bank_connections (user_id);

-- Webhooks já recebidos (deduplicação: provedores reenviam o mesmo evento).
CREATE TABLE webhook_events (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX webhook_events_received_idx ON webhook_events (received_at);

-- Fila de trabalhos no próprio Postgres (SELECT ... FOR UPDATE SKIP LOCKED).
-- Vários workers consomem em paralelo sem pegar o mesmo trabalho.
CREATE TABLE jobs (
  id           bigserial PRIMARY KEY,
  queue        text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'dead')),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs (run_at) WHERE status = 'pending';
CREATE INDEX jobs_running_idx ON jobs (locked_at) WHERE status = 'running';
CREATE INDEX jobs_done_idx ON jobs (updated_at) WHERE status = 'done';
