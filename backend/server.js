require('dotenv').config({ path: __dirname + '/.env' });

// Valida força mínima do JWT_SECRET antes de subir o servidor (V-05)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET ausente ou fraco (mínimo 32 caracteres).');
}

const express = require('express');
const helmet  = require('helmet');
const path    = require('path');

const auth           = require('./middleware/auth');
const demoGuard      = require('./middleware/demoGuard');
const rotasAuth      = require('./routes/auth');
const rotasAdmin     = require('./routes/admin');
const rotasCategorias = require('./routes/categorias');
const rotasProdutos  = require('./routes/produtos');
const rotasComandas  = require('./routes/comandas');
const rotasHistorico = require('./routes/historico');
const rotasFornecedores = require('./routes/fornecedores');
const rotasCompras   = require('./routes/compras');
const rotasSaidas    = require('./routes/saidas');
const rotasConfiguracoes = require('./routes/configuracoes');
const rotasBackup        = require('./routes/backup');
const rotasCaixas        = require('./routes/caixas');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// Body parser — limite 10mb para suportar foto base64 em compras
app.use(express.json({ limit: '10mb' }));

// Serve arquivos estáticos do frontend (index.html, app.js, styles.css, logo.png)
app.use(express.static(path.join(__dirname, '..')));

// ── Rotas públicas ──────────────────────────────────────────
app.use('/api/auth',  rotasAuth);
app.use('/api/admin', rotasAdmin);

// ── Rotas protegidas (JWT + demoGuard) ──────────────────────
app.use('/api/categorias',    auth, demoGuard, rotasCategorias);
app.use('/api/produtos',      auth, demoGuard, rotasProdutos);
app.use('/api/comandas',      auth, demoGuard, rotasComandas);
app.use('/api/historico',     auth, demoGuard, rotasHistorico);
app.use('/api/fornecedores',  auth, demoGuard, rotasFornecedores);
app.use('/api/compras',       auth, demoGuard, rotasCompras);
app.use('/api/saidas',        auth, demoGuard, rotasSaidas);
app.use('/api/configuracoes', auth, demoGuard, rotasConfiguracoes);
app.use('/api/backup',        auth, demoGuard, rotasBackup);
app.use('/api/caixas',        auth, demoGuard, rotasCaixas);

// Fallback → SPA (qualquer rota não-API devolve index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Café Aroma rodando na porta ${PORT}`);
  });
}

module.exports = app;
