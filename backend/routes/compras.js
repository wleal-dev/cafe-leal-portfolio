const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// GET /api/compras
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, data, fornecedor, cnpj, nf, valor, pagamento,
              status, categoria, itens, obs, foto
       FROM compras
       ORDER BY data DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /compras]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/compras
router.post('/', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    const { data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto } = req.body;
    if (!data || valor == null) {
      return res.status(400).json({ error: 'Data e valor obrigatórios' });
    }
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const { rows } = await db.query(
      `INSERT INTO compras (data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto`,
      [data, fornecedor || null, cnpj || null, nf || null, valorNum,
       pagamento || null, status || 'Pago', categoria || null,
       itens || null, obs || null, foto || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /compras]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/compras/:id
router.put('/:id', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    const { data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto } = req.body;
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const { rows } = await db.query(
      `UPDATE compras
       SET data=$1, fornecedor=$2, cnpj=$3, nf=$4, valor=$5,
           pagamento=$6, status=$7, categoria=$8, itens=$9, obs=$10, foto=$11
       WHERE id = $12
       RETURNING id, data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto`,
      [data, fornecedor || null, cnpj || null, nf || null, valorNum,
       pagamento || null, status || 'Pago', categoria || null,
       itens || null, obs || null, foto || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Compra não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PUT /compras/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/compras/:id
router.delete('/:id', checkRole('Gerente', 'Financeiro'), async (req, res) => {
  try {
    await db.query('DELETE FROM compras WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /compras/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
