const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// GET /api/fornecedores
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, nome, cnpj, tipo FROM fornecedores ORDER BY nome'
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /fornecedores]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/fornecedores
router.post('/', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    const { nome, cnpj, tipo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const { rows } = await db.query(
      `INSERT INTO fornecedores (nome, cnpj, tipo)
       VALUES ($1, $2, $3)
       RETURNING id, nome, cnpj, tipo`,
      [nome, cnpj || null, tipo || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /fornecedores]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/fornecedores/:id
router.put('/:id', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    const { nome, cnpj, tipo } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const { rows } = await db.query(
      `UPDATE fornecedores
       SET nome = $1, cnpj = $2, tipo = $3
       WHERE id = $4
       RETURNING id, nome, cnpj, tipo`,
      [nome, cnpj || null, tipo || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /fornecedores/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/fornecedores/:id
router.delete('/:id', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    await db.query('DELETE FROM fornecedores WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /fornecedores/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
