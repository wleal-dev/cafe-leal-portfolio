const router    = require('express').Router();
const db        = require('../db');
const checkRole = require('../middleware/checkRole');

// Helper: busca comanda com itens agregados
async function fetchComanda(id, client) {
  const cli = client || db;
  const { rows } = await cli.query(
    `SELECT
       c.id, c.nome, c.mesa, c.total, c.hora, c.data,
       c.abertura, c.operador, c.status,
       c.parent_id AS "parentId",
       COALESCE(
         json_agg(
           json_build_object(
             'id',    ci.id,
             'nome',  ci.nome,
             'qty',   ci.qty,
             'preco', ci.preco,
             'nota',  ci.nota
           ) ORDER BY ci.id
         ) FILTER (WHERE ci.id IS NOT NULL),
         '[]'
       ) AS itens
     FROM comandas c
     LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id]
  );
  return rows[0] || null;
}

// GET /api/comandas
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         c.id, c.nome, c.mesa, c.total, c.hora, c.data,
         c.abertura, c.operador, c.status,
         c.parent_id AS "parentId",
         COALESCE(
           json_agg(
             json_build_object(
               'id',    ci.id,
               'nome',  ci.nome,
               'qty',   ci.qty,
               'preco', ci.preco,
               'nota',  ci.nota
             ) ORDER BY ci.id
           ) FILTER (WHERE ci.id IS NOT NULL),
           '[]'
         ) AS itens
       FROM comandas c
       LEFT JOIN comanda_itens ci ON ci.comanda_id = c.id
       GROUP BY c.id
       ORDER BY c.abertura DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /comandas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/comandas
// Body: { nome, mesa, itens: [{ nome, qty, preco, nota }], total, hora, data, abertura, operador, parentId? }
router.post('/', async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { nome, mesa, itens = [], hora, data, abertura, operador, parentId } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome do cliente obrigatório' });

    // Validação de itens: qty > 0, preco >= 0 (V-01)
    for (const item of itens) {
      const qty = Number(item.qty);
      const preco = Number(item.preco);
      if (!Number.isFinite(qty) || qty < 1) {
        return res.status(400).json({ error: 'Quantidade inválida' });
      }
      if (!Number.isFinite(preco) || preco < 0) {
        return res.status(400).json({ error: 'Preço inválido' });
      }
    }
    // Recalcula total no servidor, ignora valor do cliente
    const totalServidor = itens.reduce(
      (s, i) => s + Number(i.preco) * Number(i.qty), 0
    );

    const { rows } = await client.query(
      `INSERT INTO comandas (nome, mesa, total, hora, data, abertura, operador, status, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'aberta', $8)
       RETURNING id`,
      [nome, mesa || null, totalServidor, hora || null, data || null,
       abertura || new Date().toISOString(), operador || null, parentId || null]
    );
    const comandaId = rows[0].id;

    if (itens.length) {
      await client.query(
        `INSERT INTO comanda_itens (comanda_id, nome, qty, preco, nota)
         SELECT $1, unnest($2::text[]), unnest($3::int[]), unnest($4::numeric[]), unnest($5::text[])`,
        [
          comandaId,
          itens.map(i => i.nome),
          itens.map(i => i.qty),
          itens.map(i => i.preco),
          itens.map(i => i.nota || ''),
        ]
      );
    }

    await client.query('COMMIT');
    const comanda = await fetchComanda(comandaId);
    res.status(201).json(comanda);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /comandas]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

// PUT /api/comandas/:id
// Body: { nome?, mesa?, total?, itens?: [...] }
// Substitui todos os itens se itens vier no body
router.put('/:id', checkRole('Gerente', 'Atendente'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { nome, mesa, hora, data, operador, itens } = req.body;

    // Validação + recálculo de total se itens forem enviados (V-01)
    let totalServidor = null;
    if (Array.isArray(itens)) {
      for (const item of itens) {
        const qty = Number(item.qty);
        const preco = Number(item.preco);
        if (!Number.isFinite(qty) || qty < 1) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Quantidade inválida' });
        }
        if (!Number.isFinite(preco) || preco < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Preço inválido' });
        }
      }
      totalServidor = itens.reduce((s, i) => s + Number(i.preco) * Number(i.qty), 0);
    }

    await client.query(
      `UPDATE comandas
       SET nome     = COALESCE($1, nome),
           mesa     = COALESCE($2, mesa),
           total    = COALESCE($3, total),
           hora     = COALESCE($4, hora),
           data     = COALESCE($5, data),
           operador = COALESCE($6, operador)
       WHERE id = $7`,
      [nome, mesa, totalServidor, hora, data, operador, req.params.id]
    );

    if (Array.isArray(itens)) {
      await client.query('DELETE FROM comanda_itens WHERE comanda_id = $1', [req.params.id]);
      if (itens.length) {
        await client.query(
          `INSERT INTO comanda_itens (comanda_id, nome, qty, preco, nota)
           SELECT $1, unnest($2::text[]), unnest($3::int[]), unnest($4::numeric[]), unnest($5::text[])`,
          [
            req.params.id,
            itens.map(i => i.nome),
            itens.map(i => i.qty),
            itens.map(i => i.preco),
            itens.map(i => i.nota || ''),
          ]
        );
      }
    }

    await client.query('COMMIT');
    const comanda = await fetchComanda(req.params.id);
    if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });
    res.json(comanda);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PUT /comandas/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

// DELETE /api/comandas/:id
router.delete('/:id', checkRole('Gerente'), async (req, res) => {
  try {
    await db.query('DELETE FROM comandas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /comandas/:id]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/comandas/:id/fechar
// Body: { desconto, descontoPercentual, totalFinal, formaPagamento }
router.post('/:id/fechar', checkRole('Gerente', 'Atendente'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const comanda = await fetchComanda(req.params.id, client);
    if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

    // Exige caixa aberto
    const { rows: caixaRows } = await client.query(
      `SELECT id FROM caixas WHERE data = CURRENT_DATE AND status = 'aberto' LIMIT 1`
    );
    if (!caixaRows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Nenhum caixa aberto. Abra o caixa antes de concluir uma venda.' });
    }

    const { desconto = 0, descontoPercentual = 0, formaPagamento, operadorFechamento = '' } = req.body;
    if (!formaPagamento) return res.status(400).json({ error: 'Forma de pagamento obrigatória' });

    // ─── Validação financeira server-side (V-01) ────────────────────────────
    // O total é SEMPRE recalculado a partir dos itens persistidos na comanda.
    // Os valores enviados pelo cliente são ignorados para o total; desconto é validado.
    const totalServidor = (comanda.itens || []).reduce(
      (s, item) => s + (Number(item.preco) * Number(item.qty)), 0
    );

    const descontoVal  = Number(desconto) || 0;
    const descontoPerc = Number(descontoPercentual) || 0;

    if (descontoVal < 0 || descontoPerc < 0 || descontoPerc > 100) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Desconto inválido' });
    }
    if (descontoVal > totalServidor) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Desconto excede o total' });
    }
    if (descontoVal > 0 && req.user.role !== 'Gerente') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Apenas Gerente pode aplicar desconto' });
    }

    const totalFinalCalculado = Math.max(0, totalServidor - descontoVal);
    // ────────────────────────────────────────────────────────────────────────

    const agora = new Date();
    const horaFechamento = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const dataFechamento = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // Inserir no histórico
    const { rows: histRows } = await client.query(
      `INSERT INTO historico
         (nome, mesa, total, hora, data, abertura, operador, status,
          hora_fechamento, data_fechamento, fechamento,
          desconto, desconto_percentual, total_final, forma_pagamento, operador_fechamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'fechada',$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        comanda.nome, comanda.mesa, totalServidor,
        comanda.hora, comanda.data, comanda.abertura, comanda.operador,
        horaFechamento, dataFechamento, agora.toISOString(),
        descontoVal, descontoPerc,
        totalFinalCalculado,
        formaPagamento, operadorFechamento,
      ]
    );
    const historicoId = histRows[0].id;

    // Copiar itens para historico_itens
    for (const item of comanda.itens) {
      await client.query(
        `INSERT INTO historico_itens (historico_id, nome, qty, preco, nota)
         VALUES ($1, $2, $3, $4, $5)`,
        [historicoId, item.nome, item.qty, item.preco, item.nota || null]
      );
    }

    // Remover comanda (cascade remove comanda_itens)
    await client.query('DELETE FROM comandas WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ ok: true, historicoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /comandas/:id/fechar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

// POST /api/comandas/:id/cancelar
router.post('/:id/cancelar', checkRole('Gerente'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const comanda = await fetchComanda(req.params.id, client);
    if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

    const { operadorFechamento = '' } = req.body || {};
    const agora = new Date();
    const horaFechamento = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const dataFechamento = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const { rows: histRows } = await client.query(
      `INSERT INTO historico
         (nome, mesa, total, hora, data, abertura, operador, status,
          hora_fechamento, data_fechamento, fechamento,
          desconto, desconto_percentual, total_final, forma_pagamento, operador_fechamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'cancelada',$8,$9,$10,0,0,$11,'Cancelada',$12)
       RETURNING id`,
      [
        comanda.nome, comanda.mesa, comanda.total,
        comanda.hora, comanda.data, comanda.abertura, comanda.operador,
        horaFechamento, dataFechamento, agora.toISOString(),
        comanda.total, operadorFechamento,
      ]
    );
    const historicoId = histRows[0].id;

    for (const item of comanda.itens) {
      await client.query(
        `INSERT INTO historico_itens (historico_id, nome, qty, preco, nota)
         VALUES ($1, $2, $3, $4, $5)`,
        [historicoId, item.nome, item.qty, item.preco, item.nota || null]
      );
    }

    await client.query('DELETE FROM comandas WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ ok: true, historicoId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /comandas/:id/cancelar]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
