const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// GET /api/categorias
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, nome FROM categorias ORDER BY nome');
    res.json(rows);
  } catch (err) {
    console.error('[GET /categorias]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/categorias
router.post('/', checkRole('Gerente'), async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const { rows } = await db.query(
      'INSERT INTO categorias (nome) VALUES ($1) RETURNING id, nome',
      [nome]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /categorias]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/categorias/:id
router.put('/:id', checkRole('Gerente'), async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const { rows } = await db.query(
      'UPDATE categorias SET nome = $1 WHERE id = $2 RETURNING id, nome',
      [nome, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /categorias/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/categorias/:id
router.delete('/:id', checkRole('Gerente'), async (req, res) => {
  try {
    await db.query('DELETE FROM categorias WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /categorias/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
