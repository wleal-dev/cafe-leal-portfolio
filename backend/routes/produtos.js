const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// GET /api/produtos
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nome, preco, categoria_id AS "categoriaId"
       FROM produtos
       WHERE ativo = TRUE
       ORDER BY nome`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /produtos]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/produtos
router.post('/', checkRole('Gerente'), async (req, res) => {
  try {
    const { nome, preco, categoriaId } = req.body;
    if (!nome || preco == null) {
      return res.status(400).json({ error: 'Nome e preço obrigatórios' });
    }
    const precoNum = Number(preco);
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }
    const { rows } = await db.query(
      `INSERT INTO produtos (nome, preco, categoria_id)
       VALUES ($1, $2, $3)
       RETURNING id, nome, preco, categoria_id AS "categoriaId"`,
      [nome, precoNum, categoriaId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /produtos]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/produtos/:id
router.put('/:id', checkRole('Gerente'), async (req, res) => {
  try {
    const { nome, preco, categoriaId } = req.body;
    if (!nome || preco == null) {
      return res.status(400).json({ error: 'Nome e preço obrigatórios' });
    }
    const precoNum = Number(preco);
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }
    const { rows } = await db.query(
      `UPDATE produtos
       SET nome = $1, preco = $2, categoria_id = $3
       WHERE id = $4
       RETURNING id, nome, preco, categoria_id AS "categoriaId"`,
      [nome, preco, categoriaId || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /produtos/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/produtos/:id  (soft delete)
router.delete('/:id', checkRole('Gerente'), async (req, res) => {
  try {
    await db.query('UPDATE produtos SET ativo = FALSE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /produtos/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
