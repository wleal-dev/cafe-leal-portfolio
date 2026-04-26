const router = require('express').Router();
const db     = require('../db');

// GET /api/historico
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         h.id, h.nome, h.mesa, h.total, h.hora, h.data,
         h.abertura, h.operador, h.status,
         h.hora_fechamento     AS "horaFechamento",
         h.data_fechamento     AS "dataFechamento",
         h.fechamento,
         h.desconto,
         h.desconto_percentual AS "descontoPercentual",
         h.total_final         AS "totalFinal",
         h.forma_pagamento     AS "formaPagamento",
         h.operador_fechamento AS "operadorFechamento",
         COALESCE(
           json_agg(
             json_build_object(
               'id',    hi.id,
               'nome',  hi.nome,
               'qty',   hi.qty,
               'preco', hi.preco,
               'nota',  hi.nota
             ) ORDER BY hi.id
           ) FILTER (WHERE hi.id IS NOT NULL),
           '[]'
         ) AS itens
       FROM historico h
       LEFT JOIN historico_itens hi ON hi.historico_id = h.id
       GROUP BY h.id
       ORDER BY h.fechamento DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /historico]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/historico  (limpar histórico — só Gerente, verificado no frontend)
router.delete('/', async (req, res) => {
  try {
    await db.query('DELETE FROM historico');
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /historico]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
