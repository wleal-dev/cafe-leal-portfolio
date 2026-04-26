module.exports = (req, res, next) => {
  const isDemoUser = req.user?.username === 'demo';
  const isDemoMode = process.env.DEMO_MODE === 'true';
  if ((isDemoUser || isDemoMode) && req.method !== 'GET') {
    return res.status(403).json({ error: 'Modo demonstração — escrita desabilitada' });
  }
  next();
};
