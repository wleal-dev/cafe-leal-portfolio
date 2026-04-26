const router = require('express').Router();
const db     = require('../db');

// GET /api/configuracoes
// Retorna objeto { budget_semanal: "800", mesas: "[1,2,...]" }
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT chave, valor FROM configuracoes');
    const result = {};
    for (const row of rows) result[row.chave] = row.valor;
    res.json(result);
  } catch (err) {
    console.error('[GET /configuracoes]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/configuracoes
// Body: { chave: string, valor: string }
router.put('/', async (req, res) => {
  try {
    const { chave, valor } = req.body;
    if (!chave || valor === undefined) {
      return res.status(400).json({ error: 'Chave e valor obrigatórios' });
    }
    await db.query(
      `INSERT INTO configuracoes (chave, valor, updated_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_em = NOW()`,
      [chave, String(valor)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /configuracoes]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
