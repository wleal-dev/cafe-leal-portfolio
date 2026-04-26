// Apaga todas as tabelas existentes e recria com o schema correto
// Uso: node backend/reset-db.js

require('dotenv').config({ path: __dirname + '/.env' });
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');
const pool   = require('./db');

async function reset() {
  const client = await pool.connect();
  try {
    console.log('Apagando tabelas existentes...');
    await client.query(`
      DROP TABLE IF EXISTS
        itens_historico, itens_comanda,
        historico_itens, historico,
        comanda_itens, comandas,
        compras, saidas, fornecedores,
        produtos, categorias,
        configuracoes, usuarios
      CASCADE
    `);
    console.log('OK');

    console.log('Criando tabelas com schema correto...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('OK');

    console.log('Criando usuários padrão...');
    const senhaAdmin = process.env.SENHA_ADMIN;
    const senhaCaixa = process.env.SENHA_CAIXA;
    if (!senhaAdmin || !senhaCaixa) {
      throw new Error('Defina SENHA_ADMIN e SENHA_CAIXA no arquivo .env antes de rodar o reset');
    }
    const usuarios = [
      { username: 'admin', senha: senhaAdmin, nome: 'Administrador', role: 'Gerente' },
      { username: 'caixa', senha: senhaCaixa, nome: 'Caixa',         role: 'Atendente' },
    ];
    for (const u of usuarios) {
      const hash = await bcrypt.hash(u.senha, 10);
      await client.query(
        `INSERT INTO users (username, senha, nome, role)
         VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
        [u.username, hash, u.nome, u.role]
      );
    }
    console.log('OK');

    console.log('\n✓ Banco resetado com sucesso!');
    console.log('  Login: admin  (Gerente)');
    console.log('  Login: caixa  (Atendente)');
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

reset();
