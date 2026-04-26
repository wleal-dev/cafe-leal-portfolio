const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// POST /api/backup/importar
// Body: JSON com { comandas, historico, produtos, categorias, compras, fornecedores, saidas, budgetSemanal }
router.post('/importar', checkRole('Gerente'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { comandas = [], historico = [], produtos = [], categorias = [],
            compras = [], fornecedores = [], saidas = [], budgetSemanal = 800 } = req.body;

    // Limpar tabelas (ordem respeita FK)
    await client.query('DELETE FROM historico_itens');
    await client.query('DELETE FROM historico');
    await client.query('DELETE FROM comanda_itens');
    await client.query('DELETE FROM comandas');
    await client.query('DELETE FROM compras');
    await client.query('DELETE FROM saidas');
    await client.query('DELETE FROM fornecedores');
    await client.query('UPDATE produtos SET ativo = FALSE');
    await client.query('DELETE FROM categorias');

    // Inserir categorias
    for (const c of categorias) {
      await client.query(
        'INSERT INTO categorias (id, nome) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [c.id, c.nome]
      );
    }
    await client.query("SELECT setval('categorias_id_seq', (SELECT COALESCE(MAX(id),0) FROM categorias))");

    // Inserir produtos
    for (const p of produtos) {
      await client.query(
        `INSERT INTO produtos (id, nome, preco, categoria_id, ativo)
         VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT DO NOTHING`,
        [p.id, p.nome, p.preco, p.categoriaId || null]
      );
    }
    await client.query("SELECT setval('produtos_id_seq', (SELECT COALESCE(MAX(id),0) FROM produtos))");

    // Inserir fornecedores
    for (const f of fornecedores) {
      await client.query(
        'INSERT INTO fornecedores (id, nome, cnpj, tipo) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [f.id, f.nome, f.cnpj || null, f.tipo || null]
      );
    }
    await client.query("SELECT setval('fornecedores_id_seq', (SELECT COALESCE(MAX(id),0) FROM fornecedores))");

    // Inserir comandas (abertas)
    for (const c of comandas) {
      const { rows } = await client.query(
        `INSERT INTO comandas (nome, mesa, total, hora, data, abertura, operador, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'aberta') RETURNING id`,
        [c.nome, c.mesa || null, c.total || 0, c.hora || null,
         c.data || null, c.abertura || new Date().toISOString(), c.operador || null]
      );
      const cid = rows[0].id;
      for (const item of (c.itens || [])) {
        await client.query(
          'INSERT INTO comanda_itens (comanda_id, nome, qty, preco, nota) VALUES ($1,$2,$3,$4,$5)',
          [cid, item.nome, item.qty, item.preco, item.nota || null]
        );
      }
    }

    // Inserir histórico
    for (const h of historico) {
      const { rows } = await client.query(
        `INSERT INTO historico
           (nome, mesa, total, hora, data, abertura, operador, status,
            hora_fechamento, data_fechamento, fechamento,
            desconto, desconto_percentual, total_final, forma_pagamento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [h.nome, h.mesa || null, h.total || 0, h.hora || null, h.data || null,
         h.abertura || null, h.operador || null, h.status || 'fechada',
         h.horaFechamento || null, h.dataFechamento || null,
         h.fechamento || new Date().toISOString(),
         h.desconto || 0, h.descontoPercentual || 0,
         h.totalFinal ?? h.total ?? 0,
         h.formaPagamento || null]
      );
      const hid = rows[0].id;
      for (const item of (h.itens || [])) {
        await client.query(
          'INSERT INTO historico_itens (historico_id, nome, qty, preco, nota) VALUES ($1,$2,$3,$4,$5)',
          [hid, item.nome, item.qty, item.preco, item.nota || null]
        );
      }
    }

    // Inserir compras
    for (const c of compras) {
      await client.query(
        `INSERT INTO compras (data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [c.data, c.fornecedor || null, c.cnpj || null, c.nf || null, c.valor,
         c.pagamento || null, c.status || 'Pago', c.categoria || null,
         c.itens || null, c.obs || null, c.foto || null]
      );
    }

    // Inserir saídas
    for (const s of saidas) {
      await client.query(
        'INSERT INTO saidas (data, descricao, categoria, valor) VALUES ($1,$2,$3,$4)',
        [s.data, s.descricao, s.categoria || null, s.valor]
      );
    }

    // Atualizar budget semanal
    await client.query(
      `INSERT INTO configuracoes (chave, valor, updated_em) VALUES ('budget_semanal', $1, NOW())
       ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_em = NOW()`,
      [String(budgetSemanal)]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /backup/importar]', err.message);
    res.status(500).json({ error: 'Erro ao importar backup' });
  } finally {
    client.release();
  }
});

module.exports = router;
