require('dotenv').config({ path: __dirname + '/.env' });
const { Pool, types } = require('pg');

// OID 1700 = NUMERIC — converter para float em toda a aplicação.
types.setTypeParser(1700, (val) => parseFloat(val));

// OID 1082 = DATE — retornar como string "YYYY-MM-DD" (evita conversão UTC→timestamp
// que desloca a data em fusos negativos como UTC-3).
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Garante que todas as conexões usem horário de Brasília
pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
});

module.exports = pool;
