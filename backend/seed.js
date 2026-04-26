// Cria as tabelas e popula o banco com dados de demonstração
// Uso: node backend/seed.js

require('dotenv').config({ path: __dirname + '/.env' });
const fs   = require('fs');
const path = require('path');
const pool = require('./db');
const { seedData } = require('./routes/admin');

async function seed() {
  const client = await pool.connect();
  try {
    // 1. Criar tabelas
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('Tabelas criadas.');

    // 2. Popular com dados de demonstração
    if (!process.env.SENHA_ADMIN || !process.env.SENHA_CAIXA) {
      throw new Error('Defina SENHA_ADMIN e SENHA_CAIXA no arquivo .env antes de rodar o seed');
    }
    await seedData(client);

    console.log('\nSeed concluído.');
    console.log('  Usuários criados:');
    console.log('    admin  / (SENHA_ADMIN) — Gerente');
    console.log('    caixa  / (SENHA_CAIXA) — Atendente');
    console.log('    demo   / Demo@1234     — Gerente (somente leitura no demo online)');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Erro no seed:', err.message);
  process.exit(1);
});
