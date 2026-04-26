// Migração de dados: lê backup JSON exportado pelo app e insere no PostgreSQL
// Uso: node backend/migrar.js <caminho-do-backup.json>
//
// O backup é gerado pela função exportarBackup() do frontend (botão "Exportar backup")

require('dotenv').config({ path: __dirname + '/.env' });

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db');

// ── Validação do argumento ──────────────────────────────────
const arquivoBackup = process.argv[2];
if (!arquivoBackup) {
  console.error('Uso: node backend/migrar.js <caminho-do-backup.json>');
  console.error('Exemplo: node backend/migrar.js cafe-leal-backup-2024-01-01.json');
  process.exit(1);
}

const caminhoAbsoluto = path.resolve(arquivoBackup);
if (!fs.existsSync(caminhoAbsoluto)) {
  console.error(`Arquivo não encontrado: ${caminhoAbsoluto}`);
  process.exit(1);
}

// ── Leitura do backup ───────────────────────────────────────
let backup;
try {
  backup = JSON.parse(fs.readFileSync(caminhoAbsoluto, 'utf8'));
} catch (err) {
  console.error('Erro ao ler arquivo JSON:', err.message);
  process.exit(1);
}

if (!backup.versao) {
  console.error('Arquivo inválido: campo "versao" ausente. Exporte o backup pelo botão "Exportar backup" no app.');
  process.exit(1);
}

const {
  comandas     = [],
  historico    = [],
  produtos     = [],
  categorias   = [],
  compras      = [],
  fornecedores = [],
  saidas       = [],
  budgetSemanal = 800,
} = backup;

console.log('\n=== Café Aroma — Migração de Dados ===');
console.log(`Backup gerado em: ${backup.data || 'desconhecido'}`);
console.log(`  categorias:   ${categorias.length}`);
console.log(`  produtos:     ${produtos.length}`);
console.log(`  comandas:     ${comandas.length}`);
console.log(`  historico:    ${historico.length}`);
console.log(`  compras:      ${compras.length}`);
console.log(`  fornecedores: ${fornecedores.length}`);
console.log(`  saidas:       ${saidas.length}`);
console.log(`  budgetSemanal: R$ ${budgetSemanal}`);
console.log('');

// ── Migração ────────────────────────────────────────────────
async function migrar() {
  const client = await pool.connect();

  try {
    // 1. Garantir que as tabelas existem
    console.log('[1/9] Criando tabelas (se não existirem)...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('      OK');

    await client.query('BEGIN');

    // 2. Limpar dados existentes (em ordem que respeita FK)
    console.log('[2/9] Limpando dados existentes...');
    await client.query('DELETE FROM historico_itens');
    await client.query('DELETE FROM historico');
    await client.query('DELETE FROM comanda_itens');
    await client.query('DELETE FROM comandas');
    await client.query('DELETE FROM compras');
    await client.query('DELETE FROM saidas');
    await client.query('DELETE FROM fornecedores');
    await client.query('UPDATE produtos SET ativo = FALSE');
    await client.query('DELETE FROM categorias');
    console.log('      OK');

    // 3. Categorias
    console.log(`[3/9] Inserindo ${categorias.length} categorias...`);
    for (const c of categorias) {
      await client.query(
        'INSERT INTO categorias (id, nome) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [c.id, c.nome]
      );
    }
    if (categorias.length) {
      await client.query(
        "SELECT setval('categorias_id_seq', (SELECT COALESCE(MAX(id), 0) FROM categorias))"
      );
    }
    console.log('      OK');

    // 4. Produtos
    console.log(`[4/9] Inserindo ${produtos.length} produtos...`);
    for (const p of produtos) {
      await client.query(
        `INSERT INTO produtos (id, nome, preco, categoria_id, ativo)
         VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT DO NOTHING`,
        [p.id, p.nome, p.preco, p.categoriaId || null]
      );
    }
    if (produtos.length) {
      await client.query(
        "SELECT setval('produtos_id_seq', (SELECT COALESCE(MAX(id), 0) FROM produtos))"
      );
    }
    console.log('      OK');

    // 5. Fornecedores
    console.log(`[5/9] Inserindo ${fornecedores.length} fornecedores...`);
    for (const f of fornecedores) {
      await client.query(
        'INSERT INTO fornecedores (id, nome, cnpj, tipo) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [f.id, f.nome, f.cnpj || null, f.tipo || null]
      );
    }
    if (fornecedores.length) {
      await client.query(
        "SELECT setval('fornecedores_id_seq', (SELECT COALESCE(MAX(id), 0) FROM fornecedores))"
      );
    }
    console.log('      OK');

    // 6. Comandas abertas (preservar como abertas)
    console.log(`[6/9] Inserindo ${comandas.length} comandas abertas...`);
    for (const c of comandas) {
      const { rows } = await client.query(
        `INSERT INTO comandas (nome, mesa, total, hora, data, abertura, operador, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'aberta') RETURNING id`,
        [c.nome, c.mesa || null, c.total || 0, c.hora || null,
         c.data || null, c.abertura || new Date().toISOString(), c.operador || null]
      );
      const comandaId = rows[0].id;
      for (const item of (c.itens || [])) {
        await client.query(
          'INSERT INTO comanda_itens (comanda_id, nome, qty, preco, nota) VALUES ($1,$2,$3,$4,$5)',
          [comandaId, item.nome, item.qty, item.preco, item.nota || null]
        );
      }
    }
    console.log('      OK');

    // 7. Histórico
    console.log(`[7/9] Inserindo ${historico.length} registros no histórico...`);
    for (const h of historico) {
      const status = h.status === 'cancelada' ? 'cancelada' : 'fechada';
      const { rows } = await client.query(
        `INSERT INTO historico
           (nome, mesa, total, hora, data, abertura, operador, status,
            hora_fechamento, data_fechamento, fechamento,
            desconto, desconto_percentual, total_final, forma_pagamento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          h.nome, h.mesa || null, h.total || 0,
          h.hora || null, h.data || null,
          h.abertura || null, h.operador || null, status,
          h.horaFechamento || null, h.dataFechamento || null,
          h.fechamento || new Date().toISOString(),
          h.desconto || 0, h.descontoPercentual || 0,
          h.totalFinal ?? h.total ?? 0,
          h.formaPagamento || null,
        ]
      );
      const historicoId = rows[0].id;
      for (const item of (h.itens || [])) {
        await client.query(
          'INSERT INTO historico_itens (historico_id, nome, qty, preco, nota) VALUES ($1,$2,$3,$4,$5)',
          [historicoId, item.nome, item.qty, item.preco, item.nota || null]
        );
      }
    }
    console.log('      OK');

    // 8. Compras
    console.log(`[8/9] Inserindo ${compras.length} compras...`);
    for (const c of compras) {
      await client.query(
        `INSERT INTO compras (data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs, foto)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [c.data, c.fornecedor || null, c.cnpj || null, c.nf || null, c.valor,
         c.pagamento || null, c.status || 'Pago', c.categoria || null,
         c.itens || null, c.obs || null, c.foto || null]
      );
    }
    for (const s of saidas) {
      await client.query(
        'INSERT INTO saidas (data, descricao, categoria, valor) VALUES ($1,$2,$3,$4)',
        [s.data, s.descricao, s.categoria || null, s.valor]
      );
    }
    console.log(`      OK (${compras.length} compras + ${saidas.length} saídas)`);

    // 9. Configurações
    console.log('[9/9] Atualizando configurações...');
    await client.query(
      `INSERT INTO configuracoes (chave, valor, updated_em) VALUES ('budget_semanal', $1, NOW())
       ON CONFLICT (chave) DO UPDATE SET valor = $1, updated_em = NOW()`,
      [String(budgetSemanal)]
    );

    // Garantir usuários padrão (não apaga se já existirem)
    const { rows: usersExistentes } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersExistentes[0].count) === 0) {
      console.log('      Criando usuários padrão (admin / caixa)...');
      const senhaAdmin = process.env.SENHA_ADMIN;
      const senhaCaixa = process.env.SENHA_CAIXA;
      if (!senhaAdmin || !senhaCaixa) {
        throw new Error('Defina SENHA_ADMIN e SENHA_CAIXA no arquivo .env antes de rodar a migração');
      }
      const usuarios = [
        { username: 'admin', senha: senhaAdmin, nome: 'Administrador', role: 'Gerente' },
        { username: 'caixa', senha: senhaCaixa, nome: 'Caixa', role: 'Atendente' },
      ];
      for (const u of usuarios) {
        const hash = await bcrypt.hash(u.senha, 10);
        await client.query(
          'INSERT INTO users (username, senha, nome, role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [u.username, hash, u.nome, u.role]
        );
      }
    }
    console.log('      OK');

    await client.query('COMMIT');

    console.log('\n✓ Migração concluída com sucesso!');
    console.log('\nResumo do que foi inserido:');
    console.log(`  ${categorias.length} categorias`);
    console.log(`  ${produtos.length} produtos`);
    console.log(`  ${fornecedores.length} fornecedores`);
    console.log(`  ${comandas.length} comandas abertas`);
    console.log(`  ${historico.length} registros no histórico`);
    console.log(`  ${compras.length} compras`);
    console.log(`  ${saidas.length} saídas avulsas`);
    console.log(`  budget semanal: R$ ${budgetSemanal}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Erro durante a migração:', err.message);
    console.error('  Nenhum dado foi alterado (rollback executado).');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrar();
