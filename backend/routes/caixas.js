const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// GET /api/caixas/hoje — retorna o caixa do dia (aberto ou fechado), ou null
router.get('/hoje', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM caixas WHERE data = CURRENT_DATE ORDER BY id DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[GET /caixas/hoje]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/caixas/resumo — preview dos totais para o modal de fechamento (Gerente)
router.get('/resumo', checkRole('Gerente'), async (req, res) => {
  try {
    const { rows: caixaRows } = await db.query(
      `SELECT * FROM caixas WHERE data = CURRENT_DATE AND status = 'aberto' LIMIT 1`
    );
    if (!caixaRows.length) {
      return res.status(404).json({ error: 'Nenhum caixa aberto hoje' });
    }
    const caixa = caixaRows[0];

    const { rows: totRows } = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Dinheiro' THEN total_final ELSE 0 END), 0) AS total_dinheiro,
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Pix'      THEN total_final ELSE 0 END), 0) AS total_pix,
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Débito'   THEN total_final ELSE 0 END), 0) AS total_debito,
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Crédito'  THEN total_final ELSE 0 END), 0) AS total_credito,
         COALESCE(SUM(total_final), 0) AS total_calculado
       FROM historico
       WHERE status = 'fechada'
         AND fechamento >= $1`,
      [caixa.hora_abertura]
    );

    res.json({ caixa, totais: totRows[0] });
  } catch (err) {
    console.error('[GET /caixas/resumo]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/caixas/abrir — abre novo caixa (Gerente ou Atendente)
router.post('/abrir', checkRole('Gerente', 'Atendente'), async (req, res) => {
  try {
    const { rows: existing } = await db.query(
      `SELECT id FROM caixas WHERE data = CURRENT_DATE AND status = 'aberto' LIMIT 1`
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Já existe um caixa aberto hoje' });
    }

    const { valorInicial = 0 } = req.body;
    const abertoPor = req.user.nome;

    const { rows } = await db.query(
      `INSERT INTO caixas (data, hora_abertura, valor_inicial, aberto_por, status)
       VALUES (CURRENT_DATE, NOW(), $1, $2, 'aberto')
       RETURNING *`,
      [valorInicial, abertoPor]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /caixas/abrir]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/caixas/fechar — fecha o caixa do dia (Gerente only)
router.post('/fechar', checkRole('Gerente'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: caixaRows } = await client.query(
      `SELECT * FROM caixas WHERE data = CURRENT_DATE AND status = 'aberto' LIMIT 1`
    );
    if (!caixaRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Nenhum caixa aberto hoje' });
    }
    const caixa = caixaRows[0];

    const { totalContado } = req.body;
    if (totalContado === undefined || totalContado === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'total_contado é obrigatório' });
    }

    const { rows: totRows } = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Dinheiro' THEN total_final ELSE 0 END), 0) AS total_dinheiro,
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Pix'      THEN total_final ELSE 0 END), 0) AS total_pix,
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Débito'   THEN total_final ELSE 0 END), 0) AS total_debito,
         COALESCE(SUM(CASE WHEN forma_pagamento = 'Crédito'  THEN total_final ELSE 0 END), 0) AS total_credito,
         COALESCE(SUM(total_final), 0) AS total_calculado
       FROM historico
       WHERE status = 'fechada'
         AND fechamento >= $1`,
      [caixa.hora_abertura]
    );
    const tots = totRows[0];

    // diferenca positiva = falta dinheiro, negativa = sobra
    const diferenca =
      (parseFloat(caixa.valor_inicial) + parseFloat(tots.total_dinheiro)) -
      parseFloat(totalContado);

    const { rows: updated } = await client.query(
      `UPDATE caixas SET
         hora_fechamento = NOW(),
         total_dinheiro  = $1,
         total_pix       = $2,
         total_debito    = $3,
         total_credito   = $4,
         total_calculado = $5,
         total_contado   = $6,
         diferenca       = $7,
         fechado_por     = $8,
         status          = 'fechado'
       WHERE id = $9
       RETURNING *`,
      [
        tots.total_dinheiro, tots.total_pix, tots.total_debito, tots.total_credito,
        tots.total_calculado, totalContado, diferenca, req.user.nome, caixa.id,
      ]
    );

    await client.query('COMMIT');
    res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /caixas/fechar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

// GET /api/caixas — histórico de caixas (Gerente e Financeiro)
router.get('/', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM caixas ORDER BY data DESC, id DESC LIMIT 30`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /caixas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
