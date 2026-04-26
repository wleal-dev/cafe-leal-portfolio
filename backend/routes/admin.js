const router = require('express').Router();
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');
const pool   = require('../db');

// POST /api/admin/reset
// Protegido por header x-reset-secret (usado pelo GitHub Actions)
router.post('/reset', async (req, res) => {
  const secret = process.env.RESET_SECRET;
  if (!secret || req.headers['x-reset-secret'] !== secret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const client = await pool.connect();
  try {
    // 1. Apagar todas as tabelas
    await client.query(`
      DROP TABLE IF EXISTS
        historico_itens, historico,
        comanda_itens, comandas,
        compras, saidas, fornecedores,
        produtos, categorias,
        caixas, configuracoes, users
      CASCADE
    `);

    // 2. Recriar schema
    const schema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
    await client.query(schema);

    // 3. Inserir todos os dados do seed
    await seedData(client);

    res.json({ ok: true, message: 'Banco resetado com sucesso' });
  } catch (err) {
    console.error('[POST /admin/reset]', err.message);
    res.status(500).json({ error: 'Erro ao resetar banco' });
  } finally {
    client.release();
  }
});

async function seedData(client) {
  // Usuários
  const usuarios = [
    { username: 'admin', senha: process.env.SENHA_ADMIN || 'Admin@1234', nome: 'Administrador', role: 'Gerente' },
    { username: 'caixa', senha: process.env.SENHA_CAIXA || 'Caixa@1234', nome: 'Caixa',         role: 'Atendente' },
    { username: 'demo',  senha: 'Demo@1234',                              nome: 'Demonstração',  role: 'Gerente' },
  ];
  for (const u of usuarios) {
    const hash = await bcrypt.hash(u.senha, 10);
    await client.query(
      `INSERT INTO users (username, senha, nome, role) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO NOTHING`,
      [u.username, hash, u.nome, u.role]
    );
  }

  // Categorias extras
  const cats = ['Bebidas', 'Doces', 'Especiais'];
  for (const nome of cats) {
    await client.query(`INSERT INTO categorias (nome) VALUES ($1) ON CONFLICT DO NOTHING`, [nome]);
  }

  // Produtos
  const { rows: categorias } = await client.query(`SELECT id, nome FROM categorias`);
  const catId = (nome) => categorias.find(c => c.nome === nome)?.id;

  const produtos = [
    { nome: 'Espresso',               preco: 6.00,  cat: 'Cafés' },
    { nome: 'Cappuccino',             preco: 9.00,  cat: 'Cafés' },
    { nome: 'Café com Leite',         preco: 7.00,  cat: 'Cafés' },
    { nome: 'Latte',                  preco: 10.00, cat: 'Cafés' },
    { nome: 'Bolo de Chocolate',      preco: 12.00, cat: 'Bolos' },
    { nome: 'Bolo de Limão',          preco: 10.00, cat: 'Bolos' },
    { nome: 'Coxinha',                preco: 6.00,  cat: 'Salgados' },
    { nome: 'Pão de Queijo',          preco: 5.00,  cat: 'Salgados' },
    { nome: 'Croissant',              preco: 8.00,  cat: 'Salgados' },
    { nome: 'Suco de Laranja',        preco: 8.00,  cat: 'Bebidas' },
    { nome: 'Limonada',               preco: 9.00,  cat: 'Bebidas' },
    { nome: 'Água Mineral',           preco: 3.00,  cat: 'Bebidas' },
    { nome: 'Brownie',                preco: 8.00,  cat: 'Doces' },
    { nome: 'Trufa de Chocolate',     preco: 5.00,  cat: 'Doces' },
    { nome: 'Combo Café + Salgado',   preco: 10.00, cat: 'Especiais' },
  ];
  for (const p of produtos) {
    await client.query(
      `INSERT INTO produtos (nome, preco, categoria_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [p.nome, p.preco, catId(p.cat)]
    );
  }

  // Fornecedores
  const fornecedores = [
    { nome: 'Distribuidora Grão & Cia', cnpj: '12.345.678/0001-90', tipo: 'Fornecedor' },
    { nome: 'Mercado São Jorge',         cnpj: '98.765.432/0001-10', tipo: 'Mercado' },
  ];
  for (const f of fornecedores) {
    await client.query(
      `INSERT INTO fornecedores (nome, cnpj, tipo) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [f.nome, f.cnpj, f.tipo]
    );
  }

  // Histórico de comandas fechadas (últimos 7 dias)
  const pagamentos = ['Pix', 'Dinheiro', 'Débito', 'Crédito'];
  const comandasHist = [
    { nome: 'Mesa 1', mesa: '1', total: 28.00, total_final: 28.00, desconto: 0, pagamento: 'Pix',     dias: 0 },
    { nome: 'Mesa 3', mesa: '3', total: 45.00, total_final: 40.50, desconto: 4.50, pagamento: 'Dinheiro', dias: 1 },
    { nome: 'Mesa 2', mesa: '2', total: 18.00, total_final: 18.00, desconto: 0, pagamento: 'Débito',  dias: 2 },
    { nome: 'Mesa 5', mesa: '5', total: 56.00, total_final: 56.00, desconto: 0, pagamento: 'Crédito', dias: 3 },
    { nome: 'Mesa 4', mesa: '4', total: 22.00, total_final: 22.00, desconto: 0, pagamento: 'Pix',     dias: 5 },
    { nome: 'Balcão', mesa: '',  total: 15.00, total_final: 15.00, desconto: 0, pagamento: 'Dinheiro', dias: 6 },
  ];

  const itensPorComanda = [
    [{ nome: 'Cappuccino', qty: 2, preco: 9.00 }, { nome: 'Pão de Queijo', qty: 2, preco: 5.00 }],
    [{ nome: 'Latte', qty: 2, preco: 10.00 }, { nome: 'Bolo de Chocolate', qty: 2, preco: 12.00 }, { nome: 'Água Mineral', qty: 1, preco: 3.00 }],
    [{ nome: 'Espresso', qty: 2, preco: 6.00 }, { nome: 'Croissant', qty: 1, preco: 8.00 }],
    [{ nome: 'Café com Leite', qty: 2, preco: 7.00 }, { nome: 'Bolo de Limão', qty: 2, preco: 10.00 }, { nome: 'Suco de Laranja', qty: 2, preco: 8.00 }],
    [{ nome: 'Cappuccino', qty: 1, preco: 9.00 }, { nome: 'Brownie', qty: 1, preco: 8.00 }, { nome: 'Trufa de Chocolate', qty: 1, preco: 5.00 }],
    [{ nome: 'Combo Café + Salgado', qty: 1, preco: 10.00 }, { nome: 'Limonada', qty: 1, preco: 9.00 }],
  ];

  for (let i = 0; i < comandasHist.length; i++) {
    const c = comandasHist[i];
    const dataFech = new Date();
    dataFech.setDate(dataFech.getDate() - c.dias);
    const dataStr = dataFech.toISOString().slice(0, 10);
    const hora    = '10:30';

    const { rows } = await client.query(
      `INSERT INTO historico
         (nome, mesa, total, hora, data, abertura, operador, status,
          hora_fechamento, data_fechamento, fechamento,
          desconto, desconto_percentual, total_final, forma_pagamento, operador_fechamento)
       VALUES ($1,$2,$3,$4,$5,$6,'demo','fechada',$4,$5,$6,$7,$8,$9,$10,'admin')
       RETURNING id`,
      [c.nome, c.mesa, c.total, hora, dataStr, dataFech,
       c.desconto, c.desconto > 0 ? 10 : 0, c.total_final, c.pagamento]
    );

    const histId = rows[0].id;
    for (const item of itensPorComanda[i]) {
      await client.query(
        `INSERT INTO historico_itens (historico_id, nome, qty, preco) VALUES ($1,$2,$3,$4)`,
        [histId, item.nome, item.qty, item.preco]
      );
    }
  }
}

module.exports = router;
module.exports.seedData = seedData;
