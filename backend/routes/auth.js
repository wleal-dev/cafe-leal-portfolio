const router    = require('express').Router();
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db        = require('../db');
const auth       = require('../middleware/auth');
const demoGuard  = require('../middleware/demoGuard');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const senhaGerenteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) {
      return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    }

    const { rows } = await db.query(
      'SELECT * FROM users WHERE username = $1 AND ativo = TRUE',
      [user.toLowerCase()]
    );
    const found = rows[0];

    if (!found || !(await bcrypt.compare(pass, found.senha))) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }

    const payload = {
      id:       found.id,
      username: found.username,
      nome:     found.nome,
      role:     found.role,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      user: { nome: found.nome, role: found.role, username: found.username },
    });
  } catch (err) {
    console.error('[POST /auth/login]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({
    nome:     req.user.nome,
    role:     req.user.role,
    username: req.user.username,
  });
});

// POST /api/auth/verificar-senha  (confirmar senha do gerente para desconto)
router.post('/verificar-senha', auth, senhaGerenteLimiter, async (req, res) => {
  try {
    const { pass } = req.body;
    if (!pass) return res.status(400).json({ error: 'Senha obrigatória' });
    const { rows } = await db.query(
      "SELECT senha FROM users WHERE role = 'Gerente' AND ativo = TRUE LIMIT 1"
    );
    if (!rows[0] || !(await bcrypt.compare(pass, rows[0].senha))) {
      return res.status(401).json({ error: 'Senha do gerente incorreta' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /auth/verificar-senha]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

function validarForcaSenha(senha) {
  if (!senha || senha.length < 8)         return 'A senha deve ter ao menos 8 caracteres';
  if (!/[A-Z]/.test(senha))               return 'A senha deve ter ao menos uma letra maiúscula';
  if (!/[a-z]/.test(senha))               return 'A senha deve ter ao menos uma letra minúscula';
  if (!/[0-9]/.test(senha))               return 'A senha deve ter ao menos um número';
  if (!/[^A-Za-z0-9]/.test(senha))        return 'A senha deve ter ao menos um caractere especial';
  return null;
}

// PUT /api/auth/senha  (trocar a própria senha)
router.put('/senha', auth, demoGuard, senhaGerenteLimiter, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha)
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });

    const erroForca = validarForcaSenha(novaSenha);
    if (erroForca) return res.status(400).json({ error: erroForca });

    const { rows } = await db.query('SELECT senha FROM users WHERE id = $1 AND ativo = TRUE', [req.user.id]);
    if (!rows[0])
      return res.status(404).json({ error: 'Usuário não encontrado' });

    if (!(await bcrypt.compare(senhaAtual, rows[0].senha)))
      return res.status(400).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query('UPDATE users SET senha = $1 WHERE id = $2', [hash, req.user.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[PUT /auth/senha]', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
