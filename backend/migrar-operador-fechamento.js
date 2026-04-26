require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');

async function main() {
  await pool.query(`
    ALTER TABLE historico
      ADD COLUMN IF NOT EXISTS operador_fechamento VARCHAR(100);
  `);
  console.log('Coluna operador_fechamento adicionada ao historico.');
  await pool.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
