require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS caixas (
      id              SERIAL PRIMARY KEY,
      data            DATE NOT NULL,
      hora_abertura   TIMESTAMPTZ NOT NULL,
      hora_fechamento TIMESTAMPTZ,
      valor_inicial   NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_dinheiro  NUMERIC(10,2),
      total_pix       NUMERIC(10,2),
      total_debito    NUMERIC(10,2),
      total_credito   NUMERIC(10,2),
      total_calculado NUMERIC(10,2),
      total_contado   NUMERIC(10,2),
      diferenca       NUMERIC(10,2),
      aberto_por      VARCHAR(100),
      fechado_por     VARCHAR(100),
      status          VARCHAR(20) DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
      criado_em       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_caixas_data   ON caixas(data);
    CREATE INDEX IF NOT EXISTS idx_caixas_status ON caixas(status);
  `);
  console.log('Tabela caixas criada com sucesso.');
  await pool.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
