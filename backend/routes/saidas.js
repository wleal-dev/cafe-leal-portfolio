const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// GET /api/saidas
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, data, descricao, categoria, valor FROM saidas ORDER BY data DESC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /saidas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/saidas
router.post('/', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    const { data, descricao, categoria, valor } = req.body;
    if (!data || !descricao || valor == null) {
      return res.status(400).json({ error: 'Data, descrição e valor obrigatórios' });
    }
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const { rows } = await db.query(
      `INSERT INTO saidas (data, descricao, categoria, valor)
       VALUES ($1, $2, $3, $4)
       RETURNING id, data, descricao, categoria, valor`,
      [data, descricao, categoria || null, valorNum]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /saidas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/saidas/:id
router.delete('/:id', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    await db.query('DELETE FROM saidas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /saidas/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
