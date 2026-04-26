// =================== HTML ESCAPE (V-03) ===================
// Usar em toda interpolação de dados vindos do banco/usuário dentro de innerHTML.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =================== API HELPER ===================
const API_BASE = '/api';

let _reqCount = 0;
function _loadingStart() {
  _reqCount++;
  const bar = document.getElementById('loading-bar');
  if (!bar) return;
  bar.classList.remove('done');
  bar.style.width = '0';
  void bar.offsetWidth;
  bar.classList.add('loading');
}
function _loadingEnd() {
  _reqCount = Math.max(0, _reqCount - 1);
  if (_reqCount > 0) return;
  const bar = document.getElementById('loading-bar');
  if (!bar) return;
  bar.classList.remove('loading');
  bar.classList.add('done');
  setTimeout(() => { bar.classList.remove('done'); bar.style.width = '0'; }, 450);
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('cl_token');
  _loadingStart();
  try {
    const res = await fetch(API_BASE + url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) {
      fazerLogout();
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro na requisição');
    }
    return res.json();
  } finally {
    _loadingEnd();
  }
}

// =================== STATE ===================
let currentUser   = null;
let itensComanda  = [];

let comandas     = [];
let historico    = [];
let produtos     = [];
let categorias   = [];
let compras      = [];
let fornecedores = [];
let saidas       = [];
let config        = {};

let caixaHoje        = null;

let avulsoLiberado   = false;
let comandaParaFechar = null;
let splitMode     = 'equal';
let splitSelection = [];
let editComandaId  = null;
let editItemIndex  = null;
let categoriaSelecionada = '';
let filtroComandas = '';

// =================== CARREGAR DADOS ===================
async function carregarDados() {
  try {
    const [_cat, _prod, _cmd, _hist, _comp, _forn, _said, _cfg, _caixa] = await Promise.all([
      apiFetch('/categorias'),
      apiFetch('/produtos'),
      apiFetch('/comandas'),
      apiFetch('/historico'),
      apiFetch('/compras'),
      apiFetch('/fornecedores'),
      apiFetch('/saidas'),
      apiFetch('/configuracoes'),
      apiFetch('/caixas/hoje'),
    ]);
    categorias    = _cat   || [];
    produtos      = _prod  || [];
    comandas      = _cmd   || [];
    historico     = _hist  || [];
    compras       = _comp  || [];
    fornecedores  = _forn  || [];
    saidas        = _said  || [];
    config        = _cfg   || {};
    caixaHoje     = _caixa || null;
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    showToast('Erro ao conectar com o servidor', 'error');
  }
}

// =================== AUTH FUNCTIONS ===================
async function fazerLogin() {
  const user = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  try {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { user, pass } });
    if (!data) return;

    localStorage.setItem('cl_token', data.token);
    currentUser = data.user;
    _prepararPaginaInicial();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('active');
    document.getElementById('user-display').textContent = data.user.nome;
    document.getElementById('user-role').textContent = data.user.role;
    const _av1 = document.getElementById('user-avatar');
    if (_av1) _av1.textContent = data.user.nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    updateAccessControls();
    await carregarDados();
    inicializarPagina();
    updateBadge();
    setMesaSuggestions();
    showToast('Bem-vindo(a), ' + data.user.nome + '!', 'success');
  } catch (err) {
    errEl.textContent = err.message || 'Usuário ou senha incorretos';
    document.getElementById('login-pass').value = '';
  }
}

function fazerLogout() {
  localStorage.removeItem('cl_token');
  currentUser = null;
  // Resetar para a página padrão antes de exibir o login
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const pgPadrao = document.getElementById('page-nova-comanda');
  const tbPadrao = document.getElementById('tab-nova-comanda');
  if (pgPadrao) pgPadrao.classList.add('active');
  if (tbPadrao) tbPadrao.classList.add('active');
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
}

function abrirModalMudarSenha() {
  document.getElementById('ms-senha-atual').value = '';
  document.getElementById('ms-nova-senha').value = '';
  document.getElementById('ms-confirma-senha').value = '';
  document.getElementById('modal-mudar-senha').classList.add('open');
  document.getElementById('ms-senha-atual').focus();
}

function fecharModalMudarSenha() {
  document.getElementById('modal-mudar-senha').classList.remove('open');
}

function validarForcaSenha(senha) {
  if (senha.length < 8)               return 'A senha deve ter ao menos 8 caracteres';
  if (!/[A-Z]/.test(senha))           return 'A senha deve ter ao menos uma letra maiúscula';
  if (!/[a-z]/.test(senha))           return 'A senha deve ter ao menos uma letra minúscula';
  if (!/[0-9]/.test(senha))           return 'A senha deve ter ao menos um número';
  if (!/[^A-Za-z0-9]/.test(senha))    return 'A senha deve ter ao menos um caractere especial (!@#$%...)';
  return null;
}

async function salvarNovaSenha() {
  const senhaAtual = document.getElementById('ms-senha-atual').value.trim();
  const novaSenha  = document.getElementById('ms-nova-senha').value;
  const confirma   = document.getElementById('ms-confirma-senha').value;

  if (!senhaAtual || !novaSenha) return showToast('Preencha todos os campos', 'error');

  const erroForca = validarForcaSenha(novaSenha);
  if (erroForca) return showToast(erroForca, 'error');

  if (novaSenha !== confirma) return showToast('As senhas não conferem', 'error');

  try {
    await apiFetch('/auth/senha', { method: 'PUT', body: { senhaAtual, novaSenha } });
    showToast('Senha alterada com sucesso!', 'success');
    fecharModalMudarSenha();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function checkSession() {
  const token = localStorage.getItem('cl_token');
  if (!token) return;

  try {
    const user = await apiFetch('/auth/me');
    if (!user) return;

    currentUser = user;
    _prepararPaginaInicial();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('active');
    document.getElementById('user-display').textContent = user.nome;
    document.getElementById('user-role').textContent = user.role || 'Atendente';
    const _av2 = document.getElementById('user-avatar');
    if (_av2) _av2.textContent = user.nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    updateAccessControls();
    await carregarDados();
    inicializarPagina();
    updateBadge();
    setMesaSuggestions();
  } catch (err) {
    localStorage.removeItem('cl_token');
  }
}

// Ajusta a página ativa no DOM antes do app ficar visível, evitando flash
function _prepararPaginaInicial() {
  if (!isFinanceiro()) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-compras');
  const tb = document.getElementById('tab-compras');
  if (pg) pg.classList.add('active');
  if (tb) tb.classList.add('active');
}

function inicializarPagina() {
  if (isFinanceiro()) {
    renderCompras();
    return;
  }
  renderProdutosComanda();
  renderItems();
  inicializarFiltrosCategorias();
}

function isGerente() {
  return currentUser && currentUser.role === 'Gerente';
}

function isAtendente() {
  return currentUser && currentUser.role === 'Atendente';
}

function isFinanceiro() {
  return currentUser && currentUser.role === 'Financeiro';
}

// =================== CLOCK ===================
function updateClock() {
  const now = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.textContent =
      now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' · ' +
      now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }
}
setInterval(updateClock, 60000);
updateClock();

// =================== UTILS: DEBOUNCE ===================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// =================== UTILS: ESC TO CLOSE MODALS ===================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(modal => {
      modal.classList.remove('open');
    });
  }
});

// =================== NAVEGAÇÃO ===================
function toggleSidebarMobile() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function showPage(page, el) {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
  // Financeiro só acessa compras e financeiro
  if (isFinanceiro() && page !== 'compras' && page !== 'financeiro') {
    showPage('compras', document.getElementById('tab-compras'));
    return;
  }
  // Produtos: apenas Gerente
  if (page === 'produtos' && !isGerente()) {
    showToast('Acesso restrito a Gerentes', 'error');
    showPage('nova-comanda', document.getElementById('tab-nova-comanda'));
    return;
  }
  // Compras e Financeiro: Gerente ou Financeiro
  if ((page === 'compras' || page === 'financeiro') && !isGerente() && !isFinanceiro()) {
    showToast('Acesso restrito', 'error');
    showPage('nova-comanda', document.getElementById('tab-nova-comanda'));
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav .tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (el) el.classList.add('active');

  if (page === 'comandas') {
    const filtroEl = document.getElementById('filtro-comandas');
    if (filtroEl) filtroEl.value = '';
    filtroComandas = '';
    renderComandas();
  }
  if (page === 'nova-comanda') {
    inicializarFiltrosCategorias();
    renderProdutosComanda();
  }
  if (page === 'caixa') {
    apiFetch('/caixas/hoje').then(c => {
      caixaHoje = c || null;
      renderCaixa();
      renderRelatorios();
    }).catch(() => {
      renderCaixa();
      renderRelatorios();
    });
    return;
  }
  if (page === 'produtos') renderProdutos();
  if (page === 'compras') renderCompras();
  if (page === 'financeiro') renderFinanceiro();
  updateAccessControls();
}

// =================== ACCESS CONTROLS ===================
function updateAccessControls() {


  const tabs = {
    'tab-nova-comanda': !isFinanceiro(),
    'tab-comandas':     !isFinanceiro(),
    'tab-caixa':        !isFinanceiro(),
    'tab-produtos':     isGerente(),
    'tab-compras':      isGerente() || isFinanceiro(),
    'tab-financeiro':   isGerente() || isFinanceiro(),
  };

  Object.entries(tabs).forEach(([id, show]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}

// =================== PRODUTOS E CATEGORIAS ===================
function renderProdutos() {
  const container = document.getElementById('produtos-list');
  if (!container) return;

  const headerActions = document.getElementById('produtos-header-actions');
  if (headerActions) headerActions.style.display = isGerente() ? 'flex' : 'none';

  const filterBar = document.getElementById('produtos-filter-bar');
  if (filterBar) filterBar.style.display = 'flex';

  const catSelect = document.getElementById('filtro-categoria-produto');
  if (catSelect && catSelect.options.length <= 1) {
    categorias.forEach(c => catSelect.add(new Option(c.nome, c.id)));
  }

  const busca = (document.getElementById('busca-produto')?.value || '').toLowerCase();
  const filtroCategoria = document.getElementById('filtro-categoria-produto')?.value || '';

  const todosProdutos = [];
  categorias.forEach(cat => {
    produtos.filter(p => p.categoriaId === cat.id).forEach(p => {
      todosProdutos.push({ ...p, categoriaNome: cat.nome });
    });
  });
  produtos.filter(p => !p.categoriaId).forEach(p => {
    todosProdutos.push({ ...p, categoriaNome: 'Sem categoria' });
  });

  const filtrados = todosProdutos.filter(p => {
    if (busca && !p.nome.toLowerCase().includes(busca)) return false;
    if (filtroCategoria && String(p.categoriaId) !== String(filtroCategoria)) return false;
    return true;
  });

  if (!filtrados.length) {
    container.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>';
    return;
  }

  const acoesHead = isGerente() ? '<th>Ações</th>' : '';
  const acoesCell = p => isGerente() ? `
    <td>
      <div style="display:flex; gap:4px;">
        <button class="btn btn-ghost btn-sm" onclick="abrirEdicaoProduto(${p.id})" title="Editar" style="padding:0.3rem 0.5rem;">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="removerProduto(${p.id})" title="Excluir" style="padding:0.3rem 0.5rem;">🗑️</button>
      </div>
    </td>` : '';

  container.innerHTML = `
    <div class="produtos-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th>Preço</th>
            ${acoesHead}
          </tr>
        </thead>
        <tbody>
          ${filtrados.map(p => `
            <tr>
              <td>
                <span style="font-weight:600; color:var(--text-primary);">${esc(p.nome)}</span>
              </td>
              <td>
                <span style="color:var(--text-secondary); font-size:13px;">${esc(p.categoriaNome)}</span>
              </td>
              <td style="font-weight:600;">R$ ${p.preco.toFixed(2)}</td>
              ${acoesCell(p)}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="padding:0.75rem 1rem; font-size:12px; color:var(--text-muted); border-top:1px solid var(--card-border);">
        Mostrando 1 a ${filtrados.length} de ${todosProdutos.length} produto${todosProdutos.length !== 1 ? 's' : ''}
      </div>
    </div>
  `;
}

function toggleCategoriaExpand(catId) {
  const items = document.getElementById('cat-items-' + catId);
  const arrow = document.getElementById('arrow-' + catId);
  if (items) {
    const isOpen = items.style.display !== 'none';
    items.style.display = isOpen ? 'none' : 'grid';
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
  }
}

// =================== KEYBOARD HANDLERS ===================
function handleEnterEmCliente(e) {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('cliente-mesa').focus(); }
}
function handleEnterEmMesa(e) {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('item-nome').focus(); }
}
function handleEnterEmItem(e) {
  if (e.key === 'Enter') { e.preventDefault(); addItem(); }
}
function handleEnterEmNota(e) {
  if (e.key === 'Enter') { e.preventDefault(); addItem(); }
}

function abrirGerenciarCategorias() {
  renderCategoriasGerenciar();
  document.getElementById('modal-gerenciar-categorias').classList.add('open');
}

function renderCategoriasGerenciar() {
  const list = document.getElementById('lista-categorias-gerenciar');
  if (!list) return;
  if (!categorias.length) {
    list.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:1rem;">Nenhuma categoria cadastrada.</div>';
    return;
  }
  list.innerHTML = categorias.map(c => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid var(--card-border); border-radius:8px;">
      <span style="font-size:14px; font-weight:500;">${esc(c.nome)}</span>
      <button class="btn btn-danger btn-sm" onclick="excluirCategoriaList(${c.id})" title="Excluir">🗑️</button>
    </div>
  `).join('');
}

async function adicionarCategoriaList() {
  const nomeInput = document.getElementById('nova-categoria-nome');
  const nome = nomeInput.value.trim();
  if (!nome) return showToast('Digite o nome da categoria', 'error');
  if (categorias.find(c => c.nome.toLowerCase() === nome.toLowerCase())) {
    return showToast('Categoria já existe', 'error');
  }
  try {
    const nova = await apiFetch('/categorias', { method: 'POST', body: { nome } });
    categorias.push(nova);
    nomeInput.value = '';
    renderCategoriasGerenciar();
    renderProdutos();
    const selectCat = document.getElementById('filtro-categoria-produto');
    if (selectCat) selectCat.add(new Option(nova.nome, nova.id));
    showToast('Categoria adicionada!');
  } catch (err) {
    showToast('Erro ao adicionar categoria: ' + err.message, 'error');
  }
}

async function excluirCategoriaList(id) {
  if (produtos.some(p => p.categoriaId === id)) {
    return showToast('Não é possível excluir: existem produtos nesta categoria', 'error');
  }
  if (!confirm('Deseja realmente excluir esta categoria?')) return;
  try {
    await apiFetch('/categorias/' + id, { method: 'DELETE' });
    categorias = categorias.filter(c => c.id !== id);
    renderCategoriasGerenciar();
    renderProdutos();
    const selectCat = document.getElementById('filtro-categoria-produto');
    if (selectCat) {
      for (let i = 0; i < selectCat.options.length; i++) {
        if (selectCat.options[i].value == id) {
          selectCat.remove(i);
          break;
        }
      }
    }
    showToast('Categoria excluída!');
  } catch (err) {
    showToast('Erro ao excluir categoria: ' + err.message, 'error');
  }
}

async function adicionarProduto() {
  const nome = document.getElementById('produto-nome').value.trim();
  const preco = parseFloat(document.getElementById('produto-preco').value);
  const categoriaId = parseInt(document.getElementById('produto-categoria').value);
  if (!nome) return showToast('Digite o nome do produto', 'error');
  if (isNaN(preco) || preco <= 0) return showToast('Digite um preço válido', 'error');
  if (!categoriaId) return showToast('Selecione uma categoria', 'error');
  try {
    const novo = await apiFetch('/produtos', { method: 'POST', body: { nome, preco, categoriaId } });
    produtos.push(novo);
    document.getElementById('produto-nome').value = '';
    document.getElementById('produto-preco').value = '';
    document.getElementById('produto-categoria').value = '';
    document.getElementById('modal-novo-produto')?.classList.remove('open');
    renderProdutos();
    showToast('Produto adicionado!');
  } catch (err) {
    showToast('Erro ao adicionar produto: ' + err.message, 'error');
  }
}

function abrirNovoProduto() {
  const select = document.getElementById('produto-categoria');
  if (select) {
    select.innerHTML = '<option value="">Selecione uma categoria</option>' +
      categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  }
  document.getElementById('produto-nome').value = '';
  document.getElementById('produto-preco').value = '';
  document.getElementById('modal-novo-produto').classList.add('open');
}

function abrirEdicaoProduto(produtoId) {
  const produto = produtos.find(p => p.id === produtoId);
  if (!produto) return;
  const selectCat = document.getElementById('edit-prod-categoria');
  if (selectCat) selectCat.innerHTML = categorias.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  document.getElementById('edit-prod-id').value = produtoId;
  document.getElementById('edit-prod-nome').value = produto.nome;
  document.getElementById('edit-prod-preco').value = produto.preco.toFixed(2);
  document.getElementById('edit-prod-categoria').value = produto.categoriaId;
  document.getElementById('modal-editar-produto').classList.add('open');
}

async function salvarEdicaoProduto() {
  const id = parseInt(document.getElementById('edit-prod-id').value);
  const nome = document.getElementById('edit-prod-nome').value.trim();
  const preco = parseFloat(document.getElementById('edit-prod-preco').value);
  const categoriaId = parseInt(document.getElementById('edit-prod-categoria').value);
  if (!nome) return showToast('Digite o nome', 'error');
  if (isNaN(preco) || preco <= 0) return showToast('Digite um preço válido', 'error');
  if (!categoriaId) return showToast('Selecione uma categoria', 'error');
  try {
    const atualizado = await apiFetch('/produtos/' + id, { method: 'PUT', body: { nome, preco, categoriaId } });
    const idx = produtos.findIndex(p => p.id === id);
    if (idx !== -1) produtos[idx] = atualizado;
    renderProdutos();
    document.getElementById('modal-editar-produto').classList.remove('open');
    showToast('Produto atualizado!');
  } catch (err) {
    showToast('Erro ao atualizar produto: ' + err.message, 'error');
  }
}

async function removerProduto(produtoId) {
  if (!isGerente()) return showToast('Apenas gerente pode remover produtos', 'error');
  if (confirm('Remover este produto?')) {
    try {
      await apiFetch('/produtos/' + produtoId, { method: 'DELETE' });
      produtos = produtos.filter(p => p.id !== produtoId);
      renderProdutos();
      showToast('Produto removido');
    } catch (err) {
      showToast('Erro ao remover produto: ' + err.message, 'error');
    }
  }
}

async function removerCategoria(catId) {
  if (!isGerente()) return showToast('Apenas gerente pode remover categorias', 'error');
  if (produtos.some(p => p.categoriaId === catId)) {
    return showToast('Não é possível remover uma categoria com produtos cadastrados', 'error');
  }
  if (confirm('Remover esta categoria?')) {
    try {
      await apiFetch('/categorias/' + catId, { method: 'DELETE' });
      categorias = categorias.filter(c => c.id !== catId);
      renderProdutos();
      showToast('Categoria removida');
    } catch (err) {
      showToast('Erro ao remover categoria: ' + err.message, 'error');
    }
  }
}

// =================== ITENS DA COMANDA ===================
function addItem() {
  const nome  = document.getElementById('item-nome').value.trim();
  const qty   = parseInt(document.getElementById('item-qty').value) || 1;
  const preco = parseFloat(document.getElementById('item-preco').value);
  const nota  = document.getElementById('item-nota').value.trim();
  if (!nome) return showToast('Digite o nome do item', 'error');
  if (isNaN(preco) || preco <= 0) return showToast('Digite o preço', 'error');
  itensComanda.push({ nome, qty, preco, nota });
  document.getElementById('item-nome').value = '';
  document.getElementById('item-preco').value = '';
  document.getElementById('item-qty').value = 1;
  document.getElementById('item-nota').value = '';
  document.getElementById('item-nome').focus();
  renderItems();
}

function removeItem(i) { itensComanda.splice(i, 1); renderItems(); }

function editarItemNota(index) {
  const item = itensComanda[index];
  if (!item) return;
  const novaNota = prompt('Observação para "' + item.nome + '":', item.nota || '');
  if (novaNota !== null) {
    itensComanda[index].nota = novaNota.trim();
    renderItems();
  }
}

function renderItems() {
  const list = document.getElementById('items-list');
  const countEl = document.getElementById('order-item-count');
  const total = itensComanda.reduce((s, i) => s + i.preco * i.qty, 0);
  if (countEl) countEl.textContent = `${itensComanda.length} item${itensComanda.length !== 1 ? 's' : ''}`;
  if (!itensComanda.length) {
    list.innerHTML = '<div class="empty-state">Nenhum item adicionado</div>';
    document.getElementById('total-display').textContent = 'R$ 0,00';
    return;
  }
  list.innerHTML = itensComanda.map((item, i) => `
    <div class="item-row">
      <div class="item-qty">${item.qty}x</div>
      <div class="item-details">
        <div class="item-name">${esc(item.nome)}</div>
        ${item.nota ? `<div class="item-note-text">${esc(item.nota)}</div>` : ''}
        <button class="item-edit" onclick="editarItemNota(${i})" style="background:none; border:none; cursor:pointer; font-size:11px; text-align:left; padding:0; color:var(--text-dim); text-decoration:underline;">+ Nota</button>
      </div>
      <div class="item-price-col">
        <span class="item-price">R$ ${(item.preco * item.qty).toFixed(2)}</span>
        <button class="item-remove" onclick="removeItem(${i})" title="Remover">×</button>
      </div>
    </div>
  `).join('');
  document.getElementById('total-display').textContent = 'R$ ' + total.toFixed(2);
}

function inicializarFiltrosCategorias() {
  const container = document.getElementById('categoria-pills');
  if (!container) return;

  let html = `<button class="categoria-pill${categoriaSelecionada === '' ? ' active' : ''}" onclick="selecionarCategoria('')">Todos</button>`;
  categorias.forEach(cat => {
    html += `<button class="categoria-pill${categoriaSelecionada == cat.id ? ' active' : ''}" onclick="selecionarCategoria(${cat.id})">${cat.nome}</button>`;
  });
  container.innerHTML = html;
}

function selecionarCategoria(id) {
  categoriaSelecionada = id;
  inicializarFiltrosCategorias();
  renderProdutosComanda();
}

function renderProdutosComanda() {
  const grid = document.getElementById('produtos-grid');
  if (!grid) return;

  let produtosFiltrados = categoriaSelecionada !== ''
    ? produtos.filter(p => p.categoriaId == categoriaSelecionada)
    : produtos;

  if (!produtosFiltrados.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1; padding:2rem; text-align:center; color:var(--text-muted);">Nenhum produto nesta categoria</div>';
    return;
  }

  grid.innerHTML = produtosFiltrados.map(produto => `
    <div class="produto-card" onclick="adicionarProdutoComanda(${produto.id})">
      <div class="produto-card-info">
        <div class="produto-card-nome">${esc(produto.nome)}</div>
        <div class="produto-card-price">R$ ${produto.preco.toFixed(2)}</div>
      </div>
      <div class="produto-card-add">＋</div>
    </div>
  `).join('');
}

function adicionarProdutoComanda(produtoId) {
  const produto = produtos.find(p => p.id === produtoId);
  if (!produto) return;
  itensComanda.push({ nome: produto.nome, qty: 1, preco: produto.preco, nota: '' });
  renderItems();
  showToast(`${produto.nome} adicionado!`, 'success');
  document.getElementById('item-nota').focus();
}

// =================== ABRIR COMANDA ===================
async function abrirComanda() {
  const nome = document.getElementById('cliente-nome').value.trim();
  const mesa = document.getElementById('cliente-mesa').value.trim();
  if (!nome) return showToast('Digite o nome do cliente', 'error');
  if (!mesa) return showToast('Digite a mesa', 'error');
  if (!itensComanda.length) return showToast('Adicione pelo menos um item', 'error');

  const total = itensComanda.reduce((s, i) => s + i.preco * i.qty, 0);
  const agora = new Date();

  const btnAbrir = document.querySelector('button[onclick="abrirComanda()"]');
  if (btnAbrir) { btnAbrir.disabled = true; btnAbrir.textContent = 'Abrindo…'; }

  try {
    const novaComanda = await apiFetch('/comandas', {
      method: 'POST',
      body: {
        nome, mesa,
        itens: [...itensComanda],
        total,
        hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        data: agora.toLocaleDateString('pt-BR'),
        abertura: agora.toISOString(),
        operador: currentUser ? currentUser.nome : 'Sistema',
      },
    });
    comandas.push(novaComanda);
    itensComanda = [];
    avulsoLiberado = false;
    document.getElementById('form-item-avulso').style.display = 'none';
    document.getElementById('btn-liberar-avulso').style.display = '';
    document.getElementById('cliente-nome').value = '';
    document.getElementById('cliente-mesa').value = '';
    renderItems();
    updateBadge();
    showToast('✓ Comanda aberta — ' + nome + ' · Mesa ' + mesa, 'success');
  } catch (err) {
    showToast('Erro ao abrir comanda: ' + err.message, 'error');
  } finally {
    if (btnAbrir) { btnAbrir.disabled = false; btnAbrir.textContent = '✓ Abrir comanda'; }
  }
}

// =================== COMANDAS ===================
function filtrarComandas() {
  filtroComandas = document.getElementById('filtro-comandas')?.value || '';
  renderComandas();
}

const debouncedFiltrarComandas = debounce(filtrarComandas, 300);

function renderComandas() {
  let abertas = comandas.filter(c => c.status === 'aberta');
  if (filtroComandas.trim()) {
    const termo = filtroComandas.toLowerCase().trim();
    abertas = abertas.filter(c =>
      c.nome.toLowerCase().includes(termo) ||
      String(c.mesa).includes(termo)
    );
  }
  const list = document.getElementById('lista-comandas');
  if (!abertas.length) {
    list.innerHTML = `<div class="empty-state" style="padding:5rem; background:white; border-radius:14px; border:1px solid var(--border-light);">
      <div style="font-size:2.5rem; margin-bottom:.75rem;">☕</div>
      <div style="font-family:'Cormorant Garamond',serif; font-size:1.2rem; font-weight:700; color:var(--brown-mid);">Nenhuma comanda aberta</div>
      <div style="color:var(--text-muted); font-size:13px; margin-top:4px;">Abra uma nova comanda para começar</div>
    </div>`;
    return;
  }
  list.innerHTML = abertas.map(c => `
    <div class="comanda-card">
      <div class="comanda-header">
        <div class="comanda-info">
          <h3 style="color:var(--text-main);">Mesa ${esc(c.mesa || c.nome)}</h3>
          <div class="comanda-meta">
            <span>${esc(c.nome)}</span>
            <span>·</span>
            <span>${esc(c.hora || '--')}</span>
            ${c.operador ? `<span>· Atend: ${esc(c.operador)}</span>` : ''}
          </div>
        </div>
        <span class="badge badge-info">${c.itens.length} item${c.itens.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="comanda-body">
        <div class="comanda-items">
          ${c.itens.map((item, i) => `
            <div class="comanda-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px dashed var(--card-border);">
              <div style="display:flex; align-items:center; flex:1; gap:10px;">
                <span style="font-weight:800; font-size:12px; color:var(--text-main); background:var(--gold-light); padding:4px 8px; border-radius:6px;">${item.qty}x</span>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="font-weight:700; font-size:13px; color:var(--text-main);">${esc(item.nome)}</span>
                  ${item.nota ? `<span style="font-size:11px; color:var(--text-dim); font-style:italic;">${esc(item.nota)}</span>` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-weight:800; font-size:13px; color:var(--text-main);">R$ ${(item.preco * item.qty).toFixed(2)}</span>
                <div style="display:flex; gap:4px;">
                  <button class="btn btn-ghost btn-sm" onclick="abrirEdicaoItem(${c.id},${i})" title="Editar" style="padding:4px 8px; border:none; background:rgba(0,0,0,0.03);">✏️</button>
                  ${isGerente() ? `<button class="btn btn-ghost btn-sm" onclick="removerItemDaComanda(${c.id},${i})" title="Excluir" style="padding:4px 8px; border:none; background:rgba(239,68,68,0.1); color:var(--red);">🗑</button>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="comanda-footer">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">Total Comanda</span>
            <span style="font-weight:800; font-size:22px; color:var(--gold);">R$ ${c.total.toFixed(2)}</span>
          </div>
          <div class="comanda-actions" style="display:flex; gap:8px;">
            <button class="btn btn-ghost btn-sm" onclick="cancelarComanda(${c.id})" style="flex:1; border:none; background:rgba(0,0,0,0.03); color:var(--text-main);">Cancelar</button>
            <button class="btn btn-gold btn-sm" onclick="iniciarFechamento(${c.id})" style="flex:2; font-size:14px;">Fechar Comanda</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

async function removerItemDaComanda(id, itemIndex) {
  if (!isGerente()) return showToast('Apenas gerente pode remover itens de comandas abertas', 'error');
  const comanda = comandas.find(c => c.id === id);
  if (!comanda) return;

  const novosItens = [...comanda.itens];
  novosItens.splice(itemIndex, 1);
  const novoTotal = novosItens.reduce((sum, item) => sum + item.preco * item.qty, 0);

  try {
    if (!novosItens.length) {
      await apiFetch('/comandas/' + id, { method: 'DELETE' });
      comandas = comandas.filter(c => c.id !== id);
      showToast('Comanda vazia removida', 'success');
    } else {
      const atualizada = await apiFetch('/comandas/' + id, {
        method: 'PUT',
        body: { itens: novosItens, total: novoTotal },
      });
      const idx = comandas.findIndex(c => c.id === id);
      if (idx !== -1) comandas[idx] = atualizada;
    }
    renderComandas();
    updateBadge();
  } catch (err) {
    showToast('Erro ao remover item: ' + err.message, 'error');
  }
}

// =================== DIVISÃO ===================
function iniciarDivisao(id) {
  comandaParaFechar = comandas.find(c => c.id === id);
  if (!comandaParaFechar) return;
  splitSelection = [];
  document.getElementById('modal-dividir').classList.add('open');
  renderSplitModal();
  updateSplitEqual();
}

function renderSplitModal() {
  splitMode = document.querySelector('input[name="split-mode"]:checked').value;
  document.getElementById('split-equal').style.display = splitMode === 'equal' ? 'block' : 'none';
  document.getElementById('split-items').style.display = splitMode === 'items' ? 'block' : 'none';
  if (splitMode === 'items') renderSplitItems();
  else updateSplitEqual();
}

function updateSplitEqual() {
  const people = parseInt(document.getElementById('split-people').value) || 2;
  const total = comandaParaFechar ? comandaParaFechar.total : 0;
  const share = total / Math.max(people, 1);
  document.getElementById('split-share').textContent = 'R$ ' + share.toFixed(2);
}

function renderSplitItems() {
  const list = document.getElementById('split-items-list');
  if (!comandaParaFechar) {
    list.innerHTML = '<div class="empty-state">Nenhuma comanda selecionada</div>';
    return;
  }
  splitSelection = [];
  list.innerHTML = comandaParaFechar.itens.map((item, i) => `
    <label class="split-item">
      <span><input type="checkbox" onchange="toggleSplitItem(${i}, this.checked)"> ${item.qty}× ${esc(item.nome)}</span>
      <span>R$ ${(item.preco * item.qty).toFixed(2)}</span>
    </label>
  `).join('');
  updateSplitItemsSubtotal();
}

function toggleSplitItem(index, checked) {
  if (checked) splitSelection.push(index);
  else splitSelection = splitSelection.filter(i => i !== index);
  updateSplitItemsSubtotal();
}

function updateSplitItemsSubtotal() {
  const subtotal = comandaParaFechar
    ? comandaParaFechar.itens.reduce((sum, item, index) => splitSelection.includes(index) ? sum + item.preco * item.qty : sum, 0)
    : 0;
  document.getElementById('split-subtotal').textContent = 'R$ ' + subtotal.toFixed(2);
  const btn = document.getElementById('split-confirm-btn');
  if (btn) btn.disabled = subtotal <= 0 && splitMode === 'items';
}

async function confirmarSplit() {
  if (!comandaParaFechar) return;

  const people = parseInt(document.getElementById('split-people').value) || 2;

  if (splitMode === 'equal') {
    const share = comandaParaFechar.total / people;
    try {
      const novasComandas = [];
      for (let i = 1; i <= people; i++) {
        const sub = await apiFetch('/comandas', {
          method: 'POST',
          body: {
            nome: `${comandaParaFechar.nome} (${i}/${people})`,
            mesa: comandaParaFechar.mesa,
            itens: comandaParaFechar.itens,
            total: share,
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            data: new Date().toLocaleDateString('pt-BR'),
            abertura: new Date().toISOString(),
            operador: comandaParaFechar.operador,
            parentId: comandaParaFechar.id,
          },
        });
        novasComandas.push(sub);
      }
      await apiFetch('/comandas/' + comandaParaFechar.id, { method: 'DELETE' });
      comandas = comandas.filter(c => c.id !== comandaParaFechar.id);
      comandas.push(...novasComandas);
      renderComandas();
      updateBadge();
      fecharSplitModal();
      showToast(`${people} sub-comandas criadas para divisão`, 'success');
    } catch (err) {
      showToast('Erro ao dividir comanda: ' + err.message, 'error');
    }
    return;
  }

  if (!splitSelection.length) return showToast('Selecione ao menos um item', 'error');
  const selectedItems   = comandaParaFechar.itens.filter((_, i) => splitSelection.includes(i));
  const remainingItems  = comandaParaFechar.itens.filter((_, i) => !splitSelection.includes(i));
  const subtotal        = selectedItems.reduce((s, item) => s + item.preco * item.qty, 0);
  const remainingTotal  = remainingItems.reduce((s, item) => s + item.preco * item.qty, 0);

  try {
    const now = new Date();
    const novaComanda = await apiFetch('/comandas', {
      method: 'POST',
      body: {
        nome: comandaParaFechar.nome,
        mesa: comandaParaFechar.mesa,
        itens: selectedItems,
        total: subtotal,
        hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        data: now.toLocaleDateString('pt-BR'),
        abertura: now.toISOString(),
        operador: comandaParaFechar.operador,
        parentId: comandaParaFechar.id,
      },
    });
    comandas.push(novaComanda);

    if (!remainingItems.length) {
      await apiFetch('/comandas/' + comandaParaFechar.id, { method: 'DELETE' });
      comandas = comandas.filter(c => c.id !== comandaParaFechar.id);
    } else {
      const atualizada = await apiFetch('/comandas/' + comandaParaFechar.id, {
        method: 'PUT',
        body: { itens: remainingItems, total: remainingTotal },
      });
      const idx = comandas.findIndex(c => c.id === comandaParaFechar.id);
      if (idx !== -1) comandas[idx] = atualizada;
    }

    renderComandas();
    updateBadge();
    fecharSplitModal();
    showToast(`Dividido: R$ ${subtotal.toFixed(2)} em nova comanda`, 'success');
  } catch (err) {
    showToast('Erro ao dividir comanda: ' + err.message, 'error');
  }
}

function fecharSplitModal() {
  document.getElementById('modal-dividir').classList.remove('open');
  comandaParaFechar = null;
  splitSelection = [];
  const radioEqual = document.querySelector('input[name="split-mode"][value="equal"]');
  if (radioEqual) radioEqual.checked = true;
  renderSplitModal();
}

// =================== EDIÇÃO DE ITEM ===================
function abrirEdicaoItem(comandaId, itemIndex) {
  const comanda = comandas.find(c => c.id === comandaId);
  if (!comanda || !comanda.itens[itemIndex]) return;
  editComandaId  = comandaId;
  editItemIndex  = itemIndex;
  const item = comanda.itens[itemIndex];
  document.getElementById('edit-item-nome').value  = item.nome;
  document.getElementById('edit-item-qty').value   = item.qty;
  document.getElementById('edit-item-preco').value = item.preco.toFixed(2);
  document.getElementById('edit-item-total').value = 'R$ ' + (item.preco * item.qty).toFixed(2);
  document.getElementById('edit-item-nota').value  = item.nota || '';
  const qtyInput = document.getElementById('edit-item-qty');
  qtyInput.oninput = function() {
    const q = parseInt(this.value) || 1;
    document.getElementById('edit-item-total').value = 'R$ ' + (item.preco * q).toFixed(2);
  };
  document.getElementById('modal-editar-item').classList.add('open');
}

function fecharEdicaoItem() {
  document.getElementById('modal-editar-item').classList.remove('open');
  editComandaId = null;
  editItemIndex = null;
}

async function salvarEdicaoItem() {
  const comanda = comandas.find(c => c.id === editComandaId);
  if (!comanda || editItemIndex == null || !comanda.itens[editItemIndex]) return;
  const itemOriginal = comanda.itens[editItemIndex];
  const qty  = parseInt(document.getElementById('edit-item-qty').value) || 1;
  const nota = document.getElementById('edit-item-nota').value.trim();

  const novosItens = [...comanda.itens];
  novosItens[editItemIndex] = { nome: itemOriginal.nome, qty, preco: itemOriginal.preco, nota };
  const novoTotal = novosItens.reduce((s, i) => s + i.preco * i.qty, 0);

  try {
    const atualizada = await apiFetch('/comandas/' + editComandaId, {
      method: 'PUT',
      body: { itens: novosItens, total: novoTotal },
    });
    const idx = comandas.findIndex(c => c.id === editComandaId);
    if (idx !== -1) comandas[idx] = atualizada;
    renderComandas();
    fecharEdicaoItem();
    showToast('Item atualizado', 'success');
  } catch (err) {
    showToast('Erro ao salvar item: ' + err.message, 'error');
  }
}

// =================== FECHAMENTO DE COMANDA ===================
function iniciarFechamento(id) {
  if (!caixaHoje || caixaHoje.status !== 'aberto') {
    const msg = !caixaHoje
      ? 'Abra o caixa antes de concluir uma venda.'
      : 'Caixa encerrado. Um novo caixa precisa ser aberto.';
    return showToast(msg, 'error');
  }

  comandaParaFechar = comandas.find(c => c.id === id);
  if (!comandaParaFechar) return;
  document.getElementById('modal-desc').textContent = comandaParaFechar.nome + ' · Mesa ' + comandaParaFechar.mesa;
  document.getElementById('modal-total').textContent = 'R$ ' + comandaParaFechar.total.toFixed(2);

  tipoDesconto = 'percent';
  document.getElementById('desc-input').value = '';
  document.getElementById('desconto-aplicado').textContent = 'R$ 0,00';
  document.getElementById('desc-subtotal').textContent = 'R$ ' + comandaParaFechar.total.toFixed(2);
  document.getElementById('desc-total-final').textContent = 'R$ ' + comandaParaFechar.total.toFixed(2);

  definirTipoDesconto('percent');
  verificarDesconto();

  formaPagamentoSelecionada = '';
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  const trocoBox = document.getElementById('troco-box');
  if (trocoBox) trocoBox.style.display = 'none';
  document.getElementById('modal-fechar').classList.add('open');
}

function fecharModal() {
  document.getElementById('modal-fechar').classList.remove('open');
  comandaParaFechar = null;
}

// =================== DESCONTO ===================
let tipoDesconto = 'percent';

function definirTipoDesconto(tipo) {
  tipoDesconto = tipo;
  const btnPercent = document.getElementById('toggle-desc-percent');
  const btnValor   = document.getElementById('toggle-desc-valor');
  const label      = document.getElementById('label-desc-input');
  const input      = document.getElementById('desc-input');

  if (tipo === 'percent') {
    btnPercent.className = 'btn btn-gold';
    btnValor.className   = 'btn btn-ghost';
    label.textContent    = 'Valor (%)';
    input.placeholder    = '0';
    input.max            = '100';
    input.step           = '0.1';
  } else {
    btnPercent.className = 'btn btn-ghost';
    btnValor.className   = 'btn btn-gold';
    label.textContent    = 'Valor (R$)';
    input.placeholder    = '0,00';
    input.max            = comandaParaFechar ? comandaParaFechar.total.toFixed(2) : '0';
    input.step           = '0.01';
  }
  input.value = '';
  verificarDesconto();
}

function verificarDesconto() {
  const input         = document.getElementById('desc-input');
  const valor         = parseFloat(input.value) || 0;
  const btn           = document.getElementById('btn-aplicar-desconto');
  const preview       = document.getElementById('desc-preview');
  const previewValor  = document.getElementById('desc-preview-valor');
  const labelMax      = document.getElementById('label-desc-input');

  if (!comandaParaFechar || !input) return;

  const totalComanda = comandaParaFechar.total;
  let descAplicado = 0;
  let valido = false;

  if (tipoDesconto === 'percent') {
    const maxPercent = Math.min(100, valor);
    if (valor > 0 && valor <= 100) { descAplicado = (totalComanda * valor) / 100; valido = true; }
    labelMax.textContent = `Valor (%) - máx: ${maxPercent}%`;
  } else {
    const maxValor = Math.min(totalComanda, valor);
    if (valor > 0 && valor <= totalComanda) { descAplicado = valor; valido = true; }
    labelMax.textContent = `Valor (R$) - máx: R$ ${totalComanda.toFixed(2)}`;
  }

  if (btn) {
    btn.disabled = !valido;
    btn.style.opacity = valido ? '1' : '0.5';
    btn.style.cursor  = valido ? 'pointer' : 'not-allowed';
  }
  if (preview && previewValor) {
    preview.style.display = valido ? 'block' : 'none';
    previewValor.textContent = 'R$ ' + descAplicado.toFixed(2);
  }
}

function abrirModalSenhaAvulso() {
  if (isGerente()) {
    avulsoLiberado = true;
    document.getElementById('form-item-avulso').style.display = 'block';
    document.getElementById('btn-liberar-avulso').style.display = 'none';
    document.getElementById('item-nome').focus();
    return;
  }
  document.getElementById('modal-senha-avulso').classList.add('open');
  document.getElementById('senha-gerente-avulso').value = '';
  setTimeout(() => document.getElementById('senha-gerente-avulso').focus(), 100);
}

function fecharModalSenhaAvulso() {
  document.getElementById('modal-senha-avulso').classList.remove('open');
}

async function confirmarSenhaAvulso() {
  const senha = document.getElementById('senha-gerente-avulso').value;
  try {
    await apiFetch('/auth/verificar-senha', { method: 'POST', body: { pass: senha } });
  } catch {
    return showToast('Senha da gerente incorreta', 'error');
  }
  avulsoLiberado = true;
  fecharModalSenhaAvulso();
  document.getElementById('form-item-avulso').style.display = 'block';
  document.getElementById('btn-liberar-avulso').style.display = 'none';
  document.getElementById('item-nome').focus();
}

function abrirModalSenhaDesconto() {
  if (isGerente()) {
    _aplicarDesconto();
    return;
  }
  document.getElementById('modal-senha-desconto').classList.add('open');
  document.getElementById('senha-gerente-desconto').value = '';
  document.getElementById('senha-gerente-desconto').focus();
}

function fecharModalSenhaDesconto() {
  document.getElementById('modal-senha-desconto').classList.remove('open');
}

function _aplicarDesconto() {
  if (!comandaParaFechar) return;
  const input      = document.getElementById('desc-input');
  const valor      = parseFloat(input.value) || 0;
  if (valor <= 0) return showToast('Digite um valor de desconto', 'error');

  const totalComanda = comandaParaFechar.total;
  let descAplicado = 0;

  if (tipoDesconto === 'percent') {
    if (valor > 100) return showToast('Desconto máximo é 100%', 'error');
    descAplicado = (totalComanda * valor) / 100;
  } else {
    if (valor > totalComanda) return showToast('Desconto não pode exceder o total', 'error');
    descAplicado = valor;
  }

  const totalFinal = Math.max(0, totalComanda - descAplicado);
  document.getElementById('desconto-aplicado').textContent = 'R$ ' + descAplicado.toFixed(2);
  document.getElementById('desc-subtotal').textContent     = 'R$ ' + totalComanda.toFixed(2);
  document.getElementById('desc-total-final').textContent  = 'R$ ' + totalFinal.toFixed(2);
  document.getElementById('modal-total').textContent       = 'R$ ' + totalFinal.toFixed(2);

  input.value = '';
  verificarDesconto();
  showToast('Desconto de R$ ' + descAplicado.toFixed(2) + ' aplicado', 'success');
}

async function confirmarDescontoComSenha() {
  if (!comandaParaFechar) { fecharModalSenhaDesconto(); return; }

  const senhaDigitada = document.getElementById('senha-gerente-desconto').value;
  const input         = document.getElementById('desc-input');
  const valor         = parseFloat(input.value) || 0;

  if (valor <= 0) return showToast('Digite um valor de desconto', 'error');

  try {
    await apiFetch('/auth/verificar-senha', { method: 'POST', body: { pass: senhaDigitada } });
  } catch {
    return showToast('Senha do gerente incorreta', 'error');
  }

  fecharModalSenhaDesconto();
  _aplicarDesconto();
}

let formaPagamentoSelecionada = '';

function selecionarPagamento(btn, forma) {
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  formaPagamentoSelecionada = forma;

  const trocoBox = document.getElementById('troco-box');
  if (!trocoBox) return;
  if (forma === 'Dinheiro') {
    trocoBox.style.display = 'block';
    document.getElementById('valor-recebido').value = '';
    document.getElementById('troco-resultado').style.display = 'none';
    document.getElementById('troco-insuficiente').style.display = 'none';
    const totalFinal = _getTotalFinalAtual();
    const refEl = document.getElementById('troco-total-ref');
    if (refEl) refEl.textContent = totalFinal.toFixed(2).replace('.', ',');
  } else {
    trocoBox.style.display = 'none';
  }
}

function _getTotalFinalAtual() {
  if (!comandaParaFechar) return 0;
  const descAplicadoEl = document.getElementById('desconto-aplicado');
  const descAplicado = descAplicadoEl
    ? parseFloat(descAplicadoEl.textContent.replace('R$ ', '').replace(',', '.')) || 0
    : 0;
  return Math.max(0, comandaParaFechar.total - descAplicado);
}

function calcularTroco() {
  const recebido = parseFloat(document.getElementById('valor-recebido').value) || 0;
  const totalFinal = _getTotalFinalAtual();
  const trocoEl     = document.getElementById('troco-resultado');
  const insufEl     = document.getElementById('troco-insuficiente');
  const valorEl     = document.getElementById('troco-valor');

  if (!recebido) {
    trocoEl.style.display = 'none';
    insufEl.style.display = 'none';
    return;
  }
  if (recebido < totalFinal) {
    trocoEl.style.display = 'none';
    insufEl.style.display = 'block';
    const refEl = document.getElementById('troco-total-ref');
    if (refEl) refEl.textContent = totalFinal.toFixed(2).replace('.', ',');
    return;
  }
  insufEl.style.display = 'none';
  trocoEl.style.display = 'block';
  valorEl.textContent = 'R$ ' + (recebido - totalFinal).toFixed(2).replace('.', ',');
}

async function confirmarFechamento() {
  if (!comandaParaFechar) return;

  if (!formaPagamentoSelecionada) {
    document.getElementById('modal-fechar').querySelector('.modal-body > div:nth-child(4)').style.border = '2px solid var(--red)';
    return showToast('Selecione uma forma de pagamento', 'error');
  }
  const formaPagamento = formaPagamentoSelecionada;

  const descAplicadoEl = document.getElementById('desconto-aplicado');
  const descAplicado = descAplicadoEl
    ? parseFloat(descAplicadoEl.textContent.replace('R$ ', '').replace(',', '.')) || 0
    : 0;

  const descPercEl    = document.getElementById('desc-percentual');
  const descPercentual = descPercEl ? parseFloat(descPercEl.value) || 0 : 0;

  const totalFinal = Math.max(0, comandaParaFechar.total - descAplicado);

  const operadorFechamento = currentUser ? currentUser.nome : '';
  try {
    await apiFetch('/comandas/' + comandaParaFechar.id + '/fechar', {
      method: 'POST',
      body: { desconto: descAplicado, descontoPercentual: descPercentual, totalFinal, formaPagamento, operadorFechamento },
    });

    const agora = new Date();
    const registro = {
      ...comandaParaFechar,
      status: 'fechada',
      horaFechamento: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dataFechamento: agora.toLocaleDateString('pt-BR'),
      fechamento: agora.toISOString(),
      desconto: descAplicado,
      descontoPercentual: descPercentual,
      totalFinal,
      formaPagamento,
      operadorFechamento,
    };
    historico.push(registro);
    comandas = comandas.filter(c => c.id !== comandaParaFechar.id);

    fecharModal();
    updateBadge();
    renderComandas();

    const msgDesc = descAplicado > 0 ? ` | Desconto R$ ${descAplicado.toFixed(2)}` : '';
    let msgTroco = '';
    if (formaPagamento === 'Dinheiro') {
      const recebido = parseFloat(document.getElementById('valor-recebido')?.value) || 0;
      if (recebido >= totalFinal) {
        const troco = recebido - totalFinal;
        msgTroco = ` | Troco R$ ${troco.toFixed(2).replace('.', ',')}`;
      }
    }
    showToast(`✓ R$ ${totalFinal.toFixed(2)} · ${formaPagamento}${msgDesc}${msgTroco}`, 'success');
  } catch (err) {
    showToast('Erro ao fechar comanda: ' + err.message, 'error');
  }
}

// =================== CANCELAMENTO ===================
let comandaCancelamento = null;

function abrirConfirmacaoCancelamento(id) {
  comandaCancelamento = id;
  document.getElementById('motivo-cancelamento').value = '';
  const senhaField = document.getElementById('cancelamento-senha-field');
  if (senhaField) {
    senhaField.style.display = isGerente() ? 'none' : 'block';
    const senhaInput = document.getElementById('senha-cancelamento');
    if (senhaInput) senhaInput.value = '';
  }
  document.getElementById('modal-confirmar').classList.add('open');
}

function fecharConfirmacaoCancelamento() {
  document.getElementById('modal-confirmar').classList.remove('open');
  comandaCancelamento = null;
}

async function confirmarCancelamento() {
  if (!comandaCancelamento) return;
  const comanda = comandas.find(c => c.id === comandaCancelamento);
  if (!comanda) return;

  if (!isGerente()) {
    const senha = document.getElementById('senha-cancelamento')?.value || '';
    try {
      await apiFetch('/auth/verificar-senha', { method: 'POST', body: { pass: senha } });
    } catch {
      return showToast('Senha do gerente incorreta', 'error');
    }
  }

  const operadorFechamento = currentUser ? currentUser.nome : '';
  try {
    await apiFetch('/comandas/' + comandaCancelamento + '/cancelar', {
      method: 'POST',
      body: { operadorFechamento },
    });

    const agora = new Date();
    const cancelRecord = {
      ...comanda,
      status: 'cancelada',
      total: 0,
      totalFinal: 0,
      desconto: 0,
      horaFechamento: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dataFechamento: agora.toLocaleDateString('pt-BR'),
      fechamento: agora.toISOString(),
      formaPagamento: 'Cancelada',
      operadorFechamento,
    };
    historico.push(cancelRecord);
    comandas = comandas.filter(c => c.id !== comandaCancelamento);

    updateBadge();
    renderComandas();
    renderCaixa();
    fecharConfirmacaoCancelamento();
    showToast('Comanda cancelada e registrada');
  } catch (err) {
    showToast('Erro ao cancelar comanda: ' + err.message, 'error');
  }
}

function cancelarComanda(id) {
  abrirConfirmacaoCancelamento(id);
}

// =================== CAIXA ===================
function aplicarFiltroPeriodo() {
  showToast('Filtro de período em desenvolvimento');
}

function renderCaixa() {
  // Filtra historico pelo período do caixa aberto (se houver)
  let historicoFiltrado = historico;
  if (caixaHoje && caixaHoje.hora_abertura) {
    const abertura = new Date(caixaHoje.hora_abertura);
    historicoFiltrado = historico.filter(c => new Date(c.fechamento) >= abertura);
  }

  const totalDia    = historicoFiltrado.reduce((s, c) => s + (c.totalFinal ?? c.total), 0);
  const fechadas    = historicoFiltrado.filter(c => c.status === 'fechada');
  const ticketMedio = fechadas.length ? totalDia / fechadas.length : 0;

  document.getElementById('stat-total').textContent    = 'R$ ' + totalDia.toFixed(2);
  document.getElementById('stat-fechadas').textContent = historicoFiltrado.length;
  document.getElementById('stat-abertas').textContent  = comandas.filter(c => c.status === 'aberta').length;
  const ticketEl = document.getElementById('stat-ticket-medio');
  if (ticketEl) ticketEl.textContent = 'R$ ' + ticketMedio.toFixed(2);

  // Breakdown por forma de pagamento (do caixa atual)
  const porPagamento = {};
  historicoFiltrado.filter(c => c.status === 'fechada').forEach(c => {
    const p = c.formaPagamento || 'Outros';
    porPagamento[p] = (porPagamento[p] || 0) + (c.totalFinal ?? c.total);
  });
  const breakdownEl = document.getElementById('breakdown-pagamentos');
  if (breakdownEl) {
    breakdownEl.innerHTML = Object.keys(porPagamento).length
      ? Object.entries(porPagamento).map(([p, v]) =>
          `<div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid var(--border);">
            <span>${p}</span><strong>R$ ${v.toFixed(2)}</strong>
          </div>`
        ).join('')
      : '<span style="font-size:13px; color:var(--text-muted);">Nenhuma venda ainda</span>';
  }

  const totalResumo = document.getElementById('stat-total-resumo');
  if (totalResumo) totalResumo.textContent = 'R$ ' + totalDia.toFixed(2);

  // Renderiza banner de status do caixa
  _renderCaixaBanner();

  const list = document.getElementById('historico-list');
  if (!historicoFiltrado.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma comanda fechada neste caixa</div>';
    updateAccessControls();
    return;
  }

  list.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Horário</th>
          <th>Mesa</th>
          <th>Cliente</th>
          <th>Total</th>
          <th>Pagamento</th>
          <th>Abriu / Fechou</th>
        </tr>
      </thead>
      <tbody>
        ${[...historicoFiltrado].reverse().map(c => {
          const valor = (c.totalFinal ?? c.total).toFixed(2);
          const cls = _badgeClass(c.formaPagamento);
          const pagBadge = c.formaPagamento
            ? `<span class="badge ${cls}">${esc(c.formaPagamento)}</span>` : '--';
          return `
            <tr>
              <td style="color:var(--text-muted); white-space:nowrap;">${esc(c.horaFechamento || '--')}</td>
              <td>Mesa ${esc(c.mesa)}</td>
              <td>
                <div style="font-weight:600;">${esc(c.nome)}</div>
                ${Array.isArray(c.itens) && c.itens.length ? `
                <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
                  ${c.itens.map(it => `${it.qty}× ${esc(it.nome)}`).join(' · ')}
                </div>` : ''}
              </td>
              <td>
                <div style="font-weight:700; color:var(--green);">R$ ${valor}</div>
                ${c.desconto > 0 ? `<div style="font-size:11px; color:var(--text-muted);">desc. R$ ${parseFloat(c.desconto).toFixed(2)}</div>` : ''}
              </td>
              <td>${pagBadge}</td>
              <td style="font-size:12px; line-height:1.6;">
                <span style="color:var(--text-muted);">↑ ${esc(c.operador || '--')}</span><br>
                <span style="color:var(--text-main); font-weight:600;">↓ ${esc(c.operadorFechamento || '--')}</span>
              </td>
            </tr>`;        }).join('')}
      </tbody>
    </table>`;

  updateAccessControls();
}

function _renderCaixaBanner() {
  const banner = document.getElementById('caixa-status-banner');
  if (!banner) return;

  if (!caixaHoje) {
    banner.innerHTML = `
      <div class="caixa-banner caixa-banner-fechado">
        <div>
          <strong>Caixa não aberto</strong>
          <span>Abra o caixa para registrar o início do expediente</span>
        </div>
        <button class="btn btn-gold" onclick="abrirModalAberturaCaixa()">Abrir Caixa</button>
      </div>`;
    return;
  }

  if (caixaHoje.status === 'aberto') {
    const horaAb = new Date(caixaHoje.hora_abertura)
      .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    banner.innerHTML = `
      <div class="caixa-banner caixa-banner-aberto">
        <div>
          <strong>Caixa aberto</strong>
          <span>Abertura: ${horaAb} · Troco inicial: R$ ${parseFloat(caixaHoje.valor_inicial).toFixed(2)} · Aberto por: ${caixaHoje.aberto_por}</span>
        </div>
        ${isGerente() ? '<button class="btn btn-danger" onclick="abrirModalFechamentoCaixa()">Fechar Caixa</button>' : ''}
      </div>`;
    return;
  }

  // status === 'fechado'
  const horaFech = new Date(caixaHoje.hora_fechamento)
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  banner.innerHTML = `
    <div class="caixa-banner caixa-banner-fechado">
      <div>
        <strong>Caixa fechado às ${horaFech}</strong>
        <span>Por: ${caixaHoje.fechado_por} · Total apurado: R$ ${parseFloat(caixaHoje.total_calculado || 0).toFixed(2)}</span>
      </div>
      <button class="btn btn-gold" onclick="abrirModalAberturaCaixa()">Abrir novo caixa</button>
    </div>`;
}

function _badgeClass(forma) {
  const map = { 'Pix': 'badge-pix', 'Dinheiro': 'badge-dinheiro', 'Débito': 'badge-cartao', 'Crédito': 'badge-cartao', 'Cancelada': 'badge-cancelada' };
  return map[forma] || 'badge-info';
}

// =================== CAIXA — ABERTURA ===================

function abrirModalAberturaCaixa() {
  const input = document.getElementById('abertura-valor-inicial');
  if (input) input.value = '';
  document.getElementById('modal-abertura-caixa').classList.add('open');
}

async function confirmarAberturaCaixa() {
  const valorStr = document.getElementById('abertura-valor-inicial').value;
  const valorInicial = parseFloat(valorStr) || 0;
  try {
    const novoCaixa = await apiFetch('/caixas/abrir', {
      method: 'POST',
      body: { valorInicial },
    });
    caixaHoje = novoCaixa;
    document.getElementById('modal-abertura-caixa').classList.remove('open');
    renderCaixa();
    showToast('Caixa aberto com troco de R$ ' + valorInicial.toFixed(2), 'success');
  } catch (err) {
    showToast('Erro ao abrir caixa: ' + err.message, 'error');
  }
}

// =================== CAIXA — FECHAMENTO ===================

let _resumoFechamento = null;

async function abrirModalFechamentoCaixa() {
  if (!isGerente()) return showToast('Apenas o Gerente pode fechar o caixa', 'error');
  _resumoFechamento = null;
  const contadoEl = document.getElementById('fechamento-total-contado');
  if (contadoEl) contadoEl.value = '';
  const prevEl = document.getElementById('fechamento-diferenca-preview');
  if (prevEl) prevEl.style.display = 'none';
  document.getElementById('fechamento-resumo').innerHTML =
    '<div style="text-align:center; color:var(--text-muted); padding:1rem;">Carregando resumo...</div>';
  document.getElementById('modal-fechamento-caixa').classList.add('open');

  try {
    _resumoFechamento = await apiFetch('/caixas/resumo');
    _renderResumoFechamento(_resumoFechamento);
  } catch (err) {
    document.getElementById('fechamento-resumo').innerHTML =
      `<div style="color:var(--red); padding:0.5rem;">Erro: ${err.message}</div>`;
  }
}

function _renderResumoFechamento(data) {
  const { caixa, totais } = data;
  const vi = parseFloat(caixa.valor_inicial);
  const td = parseFloat(totais.total_dinheiro);
  const esperado = vi + td;
  document.getElementById('fechamento-resumo').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:0;">
      <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>Troco inicial</span><strong>R$ ${vi.toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>Vendas em Dinheiro</span><strong>R$ ${parseFloat(totais.total_dinheiro).toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>Vendas em Pix</span><strong>R$ ${parseFloat(totais.total_pix).toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>Vendas em Débito</span><strong>R$ ${parseFloat(totais.total_debito).toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>Vendas em Crédito</span><strong>R$ ${parseFloat(totais.total_credito).toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding:9px 0; font-size:14px;">
        <span style="font-weight:700;">Total geral vendido</span>
        <strong style="color:var(--green);">R$ ${parseFloat(totais.total_calculado).toFixed(2)}</strong>
      </div>
      <div style="background:var(--bg-app); border-radius:8px; padding:10px; font-size:12px; color:var(--text-muted); margin-top:4px;">
        Esperado no caixa físico (troco + dinheiro): <strong style="color:var(--text);">R$ ${esperado.toFixed(2)}</strong>
      </div>
    </div>`;
}

function calcularDiferencaFechamento() {
  if (!_resumoFechamento) return;
  const totalContado = parseFloat(document.getElementById('fechamento-total-contado').value) || 0;
  const { caixa, totais } = _resumoFechamento;
  const esperado  = parseFloat(caixa.valor_inicial) + parseFloat(totais.total_dinheiro);
  const diferenca = esperado - totalContado;

  const prevEl  = document.getElementById('fechamento-diferenca-preview');
  const valorEl = document.getElementById('fechamento-diferenca-valor');
  prevEl.style.display = 'block';

  if (Math.abs(diferenca) < 0.01) {
    prevEl.style.background = 'rgba(34,197,94,0.12)';
    prevEl.style.color = 'var(--green)';
    valorEl.textContent = 'Caixa conferido ✓';
  } else if (diferenca > 0) {
    prevEl.style.background = 'rgba(239,68,68,0.10)';
    prevEl.style.color = '#ef4444';
    valorEl.textContent = 'Falta R$ ' + diferenca.toFixed(2);
  } else {
    prevEl.style.background = 'rgba(234,179,8,0.12)';
    prevEl.style.color = '#ca8a04';
    valorEl.textContent = 'Sobra R$ ' + Math.abs(diferenca).toFixed(2);
  }
}

async function confirmarFechamentoCaixa() {
  if (!isGerente()) return;
  const totalContadoStr = document.getElementById('fechamento-total-contado').value;
  if (!totalContadoStr) return showToast('Informe o valor contado no caixa', 'error');
  const totalContado = parseFloat(totalContadoStr);
  try {
    const caixaFechado = await apiFetch('/caixas/fechar', {
      method: 'POST',
      body: { totalContado },
    });
    caixaHoje = caixaFechado;
    _resumoFechamento = null;
    document.getElementById('modal-fechamento-caixa').classList.remove('open');
    renderCaixa();
    showToast('Caixa fechado com sucesso!', 'success');
    _imprimirReciboCaixa(caixaFechado);
  } catch (err) {
    showToast('Erro ao fechar caixa: ' + err.message, 'error');
  }
}

function _imprimirReciboCaixa(caixa) {
  const horaAb   = new Date(caixa.hora_abertura).toLocaleString('pt-BR');
  const horaFech = new Date(caixa.hora_fechamento).toLocaleString('pt-BR');
  const diff = parseFloat(caixa.diferenca);
  const situacao = Math.abs(diff) < 0.01
    ? 'Caixa conferido'
    : diff > 0
      ? 'Falta R$ ' + diff.toFixed(2)
      : 'Sobra R$ ' + Math.abs(diff).toFixed(2);

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>Fechamento de Caixa</title>
    <style>
      body{font-family:monospace;font-size:13px;max-width:340px;margin:0 auto;padding:20px;}
      h2,h3{text-align:center;margin:4px 0;}
      hr{border:none;border-top:1px dashed #000;margin:10px 0;}
      .row{display:flex;justify-content:space-between;margin:5px 0;}
      .bold{font-weight:700;}
    </style>
  </head><body>
    <h2>CAFÉ AROMA</h2>
    <h3>FECHAMENTO DE CAIXA</h3>
    <hr>
    <div class="row"><span>Abertura:</span><span>${horaAb}</span></div>
    <div class="row"><span>Fechamento:</span><span>${horaFech}</span></div>
    <div class="row"><span>Aberto por:</span><span>${caixa.aberto_por}</span></div>
    <div class="row"><span>Fechado por:</span><span>${caixa.fechado_por}</span></div>
    <hr>
    <div class="row"><span>Troco inicial:</span><span>R$ ${parseFloat(caixa.valor_inicial).toFixed(2)}</span></div>
    <div class="row"><span>Dinheiro:</span><span>R$ ${parseFloat(caixa.total_dinheiro||0).toFixed(2)}</span></div>
    <div class="row"><span>Pix:</span><span>R$ ${parseFloat(caixa.total_pix||0).toFixed(2)}</span></div>
    <div class="row"><span>Débito:</span><span>R$ ${parseFloat(caixa.total_debito||0).toFixed(2)}</span></div>
    <div class="row"><span>Crédito:</span><span>R$ ${parseFloat(caixa.total_credito||0).toFixed(2)}</span></div>
    <hr>
    <div class="row bold"><span>Total vendido:</span><span>R$ ${parseFloat(caixa.total_calculado||0).toFixed(2)}</span></div>
    <div class="row"><span>Contado no caixa:</span><span>R$ ${parseFloat(caixa.total_contado||0).toFixed(2)}</span></div>
    <div class="row bold"><span>Situação:</span><span>${situacao}</span></div>
    <hr>
    <p style="text-align:center;font-size:11px;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
  </body></html>`;

  const win = window.open('', '_blank', 'width=420,height=620');
  if (win) { win.document.write(html); win.document.close(); win.print(); }
}

// =================== RELATÓRIOS ===================
function renderRelatorios() {
  const histogram    = {};
  const productStats = {};
  let minutesTotal   = 0;
  let minutesCount   = 0;

  historico.forEach(c => {
    const hour = c.horaFechamento ? c.horaFechamento.split(':')[0] : null;
    if (hour) histogram[hour] = (histogram[hour] || 0) + 1;
    if (Array.isArray(c.itens)) {
      c.itens.forEach(item => {
        const key = item.nome;
        productStats[key] = productStats[key] || { qty: 0, revenue: 0 };
        productStats[key].qty     += item.qty;
        productStats[key].revenue += item.preco * item.qty;
      });
    }
    if (c.abertura && c.fechamento) {
      const start = new Date(c.abertura);
      const end   = new Date(c.fechamento);
      if (!isNaN(start) && !isNaN(end) && end > start) {
        minutesTotal += (end - start) / 60000;
        minutesCount += 1;
      }
    }
  });

  const peakHour = Object.entries(histogram).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('stat-pico').textContent = peakHour ? `${peakHour[0]}h` : '--';
  const topByVolume = Object.entries(productStats).sort((a, b) => b[1].qty - a[1].qty)[0];
  document.getElementById('stat-top-produto').textContent = topByVolume ? topByVolume[0] : '--';
  const avgMinutes = minutesCount ? Math.round(minutesTotal / minutesCount) : 0;
  const mediaTempoEl = document.getElementById('stat-media-tempo');
  if (mediaTempoEl) mediaTempoEl.textContent = avgMinutes ? `${avgMinutes} min` : '--';

  const relPico = document.getElementById('relatorio-pico');
  relPico.innerHTML = Object.entries(histogram)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hour, count]) => `
      <div class="report-bar">
        <span class="report-bar-label">${hour}h</span>
        <div class="report-bar-fill"><span style="width:${Math.min(100, count * 14)}%;"></span></div>
        <strong>${count}</strong>
      </div>
    `).join('') || '<div class="empty-state">Sem movimentação para mostrar</div>';

  // Bug pré-existente (marginemLucro indefinida) — corrigido: ranking por qty apenas
  const ranking = Object.entries(productStats)
    .map(([name, stats]) => ({ name, qty: stats.qty }))
    .sort((a, b) => b.qty - a.qty);
  const relRanking = document.getElementById('relatorio-ranking');
  relRanking.innerHTML = ranking.length ? ranking.slice(0, 5).map(item => `
    <div class="report-bar">
      <span class="report-bar-label">${esc(item.name)}</span>
      <div class="report-bar-fill"><span style="width:${Math.min(100, item.qty * 8)}%;"></span></div>
      <strong>${item.qty}</strong>
    </div>
  `).join('') : '<div class="empty-state">Sem vendas registradas</div>';

}

// =================== LIMPAR HISTÓRICO (removido) ===================

// =================== COMPRAS E FORNECEDORES ===================
function renderCompras() {
  renderRegistroCompras();
}


function switchTab(el, tabName) {
  document.querySelectorAll('#compras-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (tabName === 'registro') renderRegistroCompras();
  else if (tabName === 'saida') renderRegistroSaida();
  else if (tabName === 'fornecedores') renderFornecedores();
}

function renderRegistroSaida() {
  const container = document.getElementById('compras-content');
  if (!container) return;
  const hoje = localDateKey(new Date());
  container.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">Registrar saída</div>
      <div class="form-row">
        <div class="form-group"><label>Data</label><input type="date" id="saida-data" value="${hoje}"></div>
        <div class="form-group"><label>Valor (R$)*</label><input type="number" id="saida-valor" placeholder="0,00" step="0.01" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Descrição*</label><input type="text" id="saida-desc" placeholder="Ex: Retirada pessoal, conta de luz"></div>
        <div class="form-group"><label>Categoria</label><select id="saida-cat"><option>Retirada</option><option>Manutenção</option><option>Pessoal</option><option>Outro</option></select></div>
      </div>
      <button class="btn btn-gold btn-full" onclick="adicionarSaidaAvulsa()">＋ Registrar saída</button>
    </div>
    <div class="card">
      <div class="card-title">Saídas registradas (últimas 10)</div>
      <div id="saidas-list" style="display:flex; flex-direction:column; gap:8px;"></div>
    </div>
  `;
  renderListaSaidas();
}

function renderListaSaidas() {
  const list = document.getElementById('saidas-list');
  if (!list) return;
  const ultimas = [...saidas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  if (!ultimas.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma saída registrada</div>';
    return;
  }
  list.innerHTML = ultimas.map(s => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem; background:var(--cream); border-radius:10px; border:1px solid var(--border-light);">
      <div>
        <div style="font-weight:600; font-size:14px;">${esc(s.descricao)}</div>
        <div style="font-size:12px; color:var(--text-muted);">${esc(s.data)} · ${esc(s.categoria)}</div>
      </div>
      <span style="font-family:'DM Mono',monospace; font-weight:700; color:var(--red);">− R$ ${s.valor.toFixed(2)}</span>
    </div>
  `).join('');
}

function renderRegistroCompras() {
  const container = document.getElementById('compras-content');
  if (!container) return;

  const hoje = localDateKey(new Date());

  container.innerHTML = `


    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">Registrar compra</div>
      <div class="form-row">
        <div class="form-group"><label>Data*</label><input type="date" id="compra-data" value="${hoje}"></div>
        <div class="form-group"><label>Forma de pagamento*</label><select id="compra-pagamento"><option>Dinheiro</option><option>Débito</option><option>Crédito</option><option>Pix</option></select></div>
      </div>
      <div class="form-group">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
          <label style="margin:0;">Fornecedor</label>
          <button type="button" class="btn btn-ghost btn-sm" onclick="toggleNovoFornecedorInline()" style="font-size:11px; padding:2px 8px;">＋ Novo</button>
        </div>
        <select id="compra-fornecedor-nome" onchange="preencherCnpjFornecedor()">
          <option value="">Selecione um fornecedor</option>
          ${fornecedores.map(f => `<option value="${f.nome}" data-cnpj="${f.cnpj || ''}">${f.nome}</option>`).join('')}
        </select>
        <div id="novo-fornecedor-inline" style="display:none; margin-top:8px; padding:0.875rem; background:var(--cream); border:1.5px solid var(--border); border-radius:8px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.6rem;">Novo fornecedor</div>
          <div class="form-row" style="margin-bottom:0.5rem;">
            <div><label style="font-size:11px;">Nome*</label><input type="text" id="inline-forn-nome" placeholder="Nome do fornecedor"></div>
            <div><label style="font-size:11px;">CNPJ</label><input type="text" id="inline-forn-cnpj" placeholder="Opcional"></div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-gold btn-sm btn-full" onclick="salvarNovoFornecedorInline()">✓ Adicionar</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleNovoFornecedorInline()">Cancelar</button>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>CNPJ</label><input type="text" id="compra-cnpj" placeholder="00.000.000/0000-00"></div>
        <div class="form-group"><label>NF / Cupom fiscal</label><input type="text" id="compra-nf" placeholder="Opcional"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Valor total (R$)*</label><input type="number" id="compra-valor" placeholder="0,00" step="0.01" min="0"></div>
        <div class="form-group"><label>Status*</label><select id="compra-status"><option>Pago</option><option>A pagar</option></select></div>
      </div>
      <div class="form-group"><label>Categoria</label><select id="compra-categoria"><option>Insumos</option><option>Contas Fixas</option><option>Fornecedores</option><option>Retirada de Caixa</option><option>Outros</option></select></div>
      <div class="form-group"><label>Itens comprados <span style="font-weight:400; color:var(--text-muted);">(opcional)</span></label><input type="text" id="compra-itens" placeholder="Ex: 5kg café, 10L leite — ajuda no controle de estoque futuro"></div>
      <div class="form-group"><label>Observações <span style="font-weight:400; color:var(--text-muted);">(opcional)</span></label><input type="text" id="compra-obs" placeholder="Opcional"></div>
      <button class="btn btn-gold btn-full" onclick="registrarCompra()">✓ Registrar compra</button>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">Compras registradas (últimas 10)</div>
      <div id="compras-list" style="display:flex; flex-direction:column; gap:8px;"></div>
    </div>
  `;

  renderListaCompras();
}

function toggleNovoFornecedorInline() {
  const panel = document.getElementById('novo-fornecedor-inline');
  if (!panel) return;
  const abrindo = panel.style.display === 'none';
  panel.style.display = abrindo ? 'block' : 'none';
  if (abrindo) document.getElementById('inline-forn-nome')?.focus();
}

async function salvarNovoFornecedorInline() {
  const nome = document.getElementById('inline-forn-nome')?.value.trim();
  const cnpj = document.getElementById('inline-forn-cnpj')?.value.trim() || '';
  if (!nome) return showToast('Digite o nome do fornecedor', 'error');
  if (fornecedores.some(f => f.nome.toLowerCase() === nome.toLowerCase())) {
    return showToast('Fornecedor já cadastrado', 'error');
  }
  try {
    const novo = await apiFetch('/fornecedores', { method: 'POST', body: { nome, cnpj, tipo: 'Fornecedor' } });
    fornecedores.push(novo);

    const select = document.getElementById('compra-fornecedor-nome');
    const opt = document.createElement('option');
    opt.value = nome;
    opt.dataset.cnpj = cnpj;
    opt.textContent = nome;
    select.appendChild(opt);
    select.value = nome;
    document.getElementById('compra-cnpj').value = cnpj;

    document.getElementById('inline-forn-nome').value = '';
    document.getElementById('inline-forn-cnpj').value = '';
    document.getElementById('novo-fornecedor-inline').style.display = 'none';
    showToast(`${nome} adicionado!`, 'success');
  } catch (err) {
    showToast('Erro ao adicionar fornecedor: ' + err.message, 'error');
  }
}

function preencherCnpjFornecedor() {
  const select    = document.getElementById('compra-fornecedor-nome');
  const cnpjField = document.getElementById('compra-cnpj');
  if (!select || !cnpjField) return;
  const opt = select.options[select.selectedIndex];
  cnpjField.value = opt?.dataset.cnpj || '';
}

function renderListaCompras() {
  const list = document.getElementById('compras-list');
  if (!list) return;
  if (!compras.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma compra registrada</div>';
    return;
  }
  list.innerHTML = compras.slice(-10).reverse().map(c => `
    <div style="padding:0.875rem; background:var(--cream); border-radius:10px; border:1px solid var(--border-light);">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <strong style="font-size:14px;">${esc(c.fornecedor)}</strong>
        <span style="font-weight:700; color:var(--brown-mid); font-family:'DM Mono',monospace;">R$ ${c.valor.toFixed(2)}</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">
        ${esc(c.data)} · ${esc(c.pagamento)} · <span style="color:${c.status === 'A pagar' ? 'var(--red)' : 'var(--green)'};">${esc(c.status)}</span> · ${esc(c.categoria)}
        ${c.nf ? ` · NF: ${esc(c.nf)}` : ''}
      </div>
      ${c.itens ? `<div style="font-size:11px; color:var(--text-muted); font-style:italic; margin-bottom:6px;">↳ ${esc(c.itens)}</div>` : ''}
      <div style="display:flex; gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="abrirEdicaoCompra(${c.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="removerCompra(${c.id})">Excluir</button>
      </div>
    </div>
  `).join('');
}


function registrarCompra() {
  const data       = document.getElementById('compra-data').value;
  const fornecedor = document.getElementById('compra-fornecedor-nome')?.value.trim() || '';
  const cnpj       = document.getElementById('compra-cnpj').value.trim();
  const nf         = document.getElementById('compra-nf').value.trim();
  const valor      = parseFloat(document.getElementById('compra-valor').value);
  const pagamento  = document.getElementById('compra-pagamento').value;
  const status     = document.getElementById('compra-status').value;
  const categoria  = document.getElementById('compra-categoria').value;
  const itens      = document.getElementById('compra-itens').value.trim();
  const obs        = document.getElementById('compra-obs').value.trim();

  if (!data) return showToast('Selecione a data', 'error');
  if (!fornecedor) return showToast('Informe o fornecedor', 'error');
  if (isNaN(valor) || valor <= 0) return showToast('Digite um valor válido', 'error');

  salvarCompra(data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs);
}

async function salvarCompra(data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs) {
  try {
    const nova = await apiFetch('/compras', {
      method: 'POST',
      body: { data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs },
    });
    compras.push(nova);

    document.getElementById('compra-data').value = localDateKey(new Date());
    const fornSelect = document.getElementById('compra-fornecedor-nome');
    if (fornSelect) fornSelect.value = '';
    document.getElementById('compra-cnpj').value     = '';
    document.getElementById('compra-nf').value       = '';
    document.getElementById('compra-valor').value    = '';
    document.getElementById('compra-pagamento').value = 'Dinheiro';
    document.getElementById('compra-status').value   = 'Pago';
    document.getElementById('compra-categoria').value = 'Insumos';
    document.getElementById('compra-itens').value    = '';
    document.getElementById('compra-obs').value      = '';

    renderListaCompras();
    showToast('Compra registrada!', 'success');
  } catch (err) {
    showToast('Erro ao registrar compra: ' + err.message, 'error');
  }
}

async function removerCompra(compraId) {
  if (confirm('Remover esta compra?')) {
    try {
      await apiFetch('/compras/' + compraId, { method: 'DELETE' });
      compras = compras.filter(c => c.id !== compraId);
      renderListaCompras();
      showToast('Compra removida');
    } catch (err) {
      showToast('Erro ao remover compra: ' + err.message, 'error');
    }
  }
}

function abrirEdicaoCompra(compraId) {
  const compra = compras.find(c => c.id === compraId);
  if (!compra) return;
  document.getElementById('edit-compra-id').value        = compraId;
  document.getElementById('edit-compra-data').value      = compra.data;
  document.getElementById('edit-compra-fornecedor').value = compra.fornecedor;
  document.getElementById('edit-compra-cnpj').value      = compra.cnpj || '';
  document.getElementById('edit-compra-nf').value        = compra.nf || '';
  document.getElementById('edit-compra-valor').value     = compra.valor.toFixed(2);
  document.getElementById('edit-compra-pagamento').value = compra.pagamento;
  document.getElementById('edit-compra-status').value    = compra.status;
  document.getElementById('edit-compra-categoria').value = compra.categoria;
  document.getElementById('edit-compra-itens').value     = compra.itens || '';
  document.getElementById('edit-compra-obs').value       = compra.obs || '';
  document.getElementById('modal-editar-compra').classList.add('open');
}

async function salvarEdicaoCompra() {
  const id        = parseInt(document.getElementById('edit-compra-id').value);
  const data      = document.getElementById('edit-compra-data').value;
  const fornecedor = document.getElementById('edit-compra-fornecedor').value.trim();
  const cnpj      = document.getElementById('edit-compra-cnpj').value.trim();
  const nf        = document.getElementById('edit-compra-nf').value.trim();
  const valor     = parseFloat(document.getElementById('edit-compra-valor').value);
  const pagamento = document.getElementById('edit-compra-pagamento').value;
  const status    = document.getElementById('edit-compra-status').value;
  const categoria = document.getElementById('edit-compra-categoria').value;
  const itens     = document.getElementById('edit-compra-itens').value.trim();
  const obs       = document.getElementById('edit-compra-obs').value.trim();

  if (!data || !fornecedor || isNaN(valor) || valor <= 0) {
    return showToast('Preencha os campos obrigatórios', 'error');
  }
  try {
    const atualizada = await apiFetch('/compras/' + id, {
      method: 'PUT',
      body: { data, fornecedor, cnpj, nf, valor, pagamento, status, categoria, itens, obs },
    });
    const idx = compras.findIndex(c => c.id === id);
    if (idx !== -1) compras[idx] = atualizada;
    renderListaCompras();
    document.getElementById('modal-editar-compra').classList.remove('open');
    showToast('Compra atualizada!', 'success');
  } catch (err) {
    showToast('Erro ao atualizar compra: ' + err.message, 'error');
  }
}

// =================== FORNECEDORES ===================
function renderFornecedores() {
  const container = document.getElementById('compras-content');
  if (!container) return;

  container.innerHTML = `

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">Cadastrar fornecedor</div>
      <div class="form-row">
        <div class="form-group"><label>Nome*</label><input type="text" id="forn-nome" placeholder="Ex: Distribuidor Café"></div>
        <div class="form-group"><label>CNPJ</label><input type="text" id="forn-cnpj" placeholder="00.000.000/0000-00"></div>
      </div>
      <div class="form-group"><label>Tipo</label><select id="forn-tipo"><option>Mercado</option><option>Fornecedor</option><option>Outro</option></select></div>
      <button class="btn btn-gold btn-full" onclick="adicionarFornecedor()">＋ Cadastrar fornecedor</button>
    </div>
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">Fornecedores cadastrados</div>
      <div id="fornecedores-list" style="display:flex; flex-direction:column; gap:8px;"></div>
    </div>
    <div class="card">
      <div class="card-title">Gastos por fornecedor (este mês)</div>
      <div id="ranking-fornecedores"></div>
    </div>
  `;

  const list = document.getElementById('fornecedores-list');
  list.innerHTML = fornecedores.length ? fornecedores.map(f => `
    <div style="padding:0.75rem; background:var(--cream); border-radius:10px; border:1px solid var(--border-light);">
      <strong>${esc(f.nome)}</strong> · <span style="font-size:12px; color:var(--text-muted);">${esc(f.tipo)}</span>
      ${f.cnpj ? `<br><span style="font-size:11px; color:var(--text-muted);">${esc(f.cnpj)}</span>` : ''}
      <div style="display:flex; gap:6px; margin-top:6px;">
        <button class="btn btn-ghost btn-sm" onclick="abrirEdicaoFornecedor(${f.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="removerFornecedor(${f.id})">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state">Nenhum fornecedor cadastrado</div>';

  const agora    = new Date();
  const mesAtual = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
  const comprasMes = compras.filter(c => c.data.startsWith(mesAtual));
  const ranking  = {};
  comprasMes.forEach(c => { ranking[c.fornecedor] = (ranking[c.fornecedor] || 0) + c.valor; });
  const rankingEl = document.getElementById('ranking-fornecedores');
  if (Object.keys(ranking).length) {
    const maxVal = Math.max(...Object.values(ranking));
    rankingEl.innerHTML = Object.entries(ranking).sort((a, b) => b[1] - a[1]).map(([nome, valor]) => `
      <div class="report-bar">
        <span class="report-bar-label">${esc(nome)}</span>
        <div class="report-bar-fill"><span style="width:${(valor / maxVal) * 100}%;"></span></div>
        <strong>R$ ${valor.toFixed(2)}</strong>
      </div>
    `).join('');
  } else {
    rankingEl.innerHTML = '<div class="empty-state">Sem gastos registrados este mês</div>';
  }
}

async function adicionarFornecedor() {
  const nome = document.getElementById('forn-nome').value.trim();
  const cnpj = document.getElementById('forn-cnpj').value.trim();
  const tipo = document.getElementById('forn-tipo').value;
  if (!nome) return showToast('Digite o nome do fornecedor', 'error');
  try {
    const novo = await apiFetch('/fornecedores', { method: 'POST', body: { nome, cnpj, tipo } });
    fornecedores.push(novo);
    document.getElementById('forn-nome').value = '';
    document.getElementById('forn-cnpj').value = '';
    renderFornecedores();
    showToast('Fornecedor adicionado!');
  } catch (err) {
    showToast('Erro ao adicionar fornecedor: ' + err.message, 'error');
  }
}

async function removerFornecedor(fornecedorId) {
  if (confirm('Remover este fornecedor?')) {
    try {
      await apiFetch('/fornecedores/' + fornecedorId, { method: 'DELETE' });
      fornecedores = fornecedores.filter(f => f.id !== fornecedorId);
      renderFornecedores();
      showToast('Fornecedor removido');
    } catch (err) {
      showToast('Erro ao remover fornecedor: ' + err.message, 'error');
    }
  }
}

function abrirEdicaoFornecedor(fornecedorId) {
  const fornec = fornecedores.find(f => f.id === fornecedorId);
  if (!fornec) return;
  document.getElementById('edit-forn-id').value   = fornecedorId;
  document.getElementById('edit-forn-nome').value = fornec.nome;
  document.getElementById('edit-forn-cnpj').value = fornec.cnpj || '';
  document.getElementById('edit-forn-tipo').value = fornec.tipo;
  document.getElementById('modal-editar-fornecedor').classList.add('open');
}

async function salvarEdicaoFornecedor() {
  const id   = parseInt(document.getElementById('edit-forn-id').value);
  const nome = document.getElementById('edit-forn-nome').value.trim();
  const cnpj = document.getElementById('edit-forn-cnpj').value.trim();
  const tipo = document.getElementById('edit-forn-tipo').value;
  if (!nome) return showToast('Digite o nome', 'error');
  try {
    const atualizado = await apiFetch('/fornecedores/' + id, { method: 'PUT', body: { nome, cnpj, tipo } });
    const idx = fornecedores.findIndex(f => f.id === id);
    if (idx !== -1) fornecedores[idx] = atualizado;
    renderFornecedores();
    document.getElementById('modal-editar-fornecedor').classList.remove('open');
    showToast('Fornecedor atualizado!');
  } catch (err) {
    showToast('Erro ao atualizar fornecedor: ' + err.message, 'error');
  }
}

// =================== FINANCEIRO ===================
function renderFinanceiro() {
  const container = document.getElementById('page-financeiro');
  if (!container) return;

  const agora    = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth();

  const diaSemana   = agora.getDay();
  const inicioSemana = new Date(agora);
  inicioSemana.setDate(agora.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  inicioSemana.setHours(0, 0, 0, 0);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6);
  fimSemana.setHours(23, 59, 59, 999);

  const entradasMes    = historico.filter(c => { const d = new Date(c.fechamento || c.data); return d.getFullYear() === anoAtual && d.getMonth() === mesAtual; });
  const entradasSemana = historico.filter(c => { const d = new Date(c.fechamento || c.data); return d >= inicioSemana && d <= fimSemana; });

  const totalEntradasMes    = entradasMes.reduce((s, c) => s + (c.totalFinal ?? c.total), 0);
  const totalEntradasSemana = entradasSemana.reduce((s, c) => s + (c.totalFinal ?? c.total), 0);

  const todasSaidas  = [...compras, ...saidas];
  const saidasMes    = todasSaidas.filter(s => { const d = parseLocal(s.data); return d.getFullYear() === anoAtual && d.getMonth() === mesAtual; });
  const saidasSemana = todasSaidas.filter(s => { const d = parseLocal(s.data); return d >= inicioSemana && d <= fimSemana; });

  const totalSaidasMes    = saidasMes.reduce((s, c) => s + c.valor, 0);
  const totalSaidasSemana = saidasSemana.reduce((s, c) => s + c.valor, 0);
  const saldoMes    = totalEntradasMes - totalSaidasMes;
  const saldoSemana = totalEntradasSemana - totalSaidasSemana;

  const mesLabel    = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const semanaLabel = `${inicioSemana.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} – ${fimSemana.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })}`;

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:1.5rem;">
      <div class="card" style="margin-bottom:0;">
        <div class="card-title" style="text-transform:capitalize;">${mesLabel}</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; color:var(--text-muted);">Entradas</span>
            <span style="font-family:'DM Mono',monospace; font-weight:700; color:var(--green);">+ R$ ${totalEntradasMes.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; color:var(--text-muted);">Saídas</span>
            <span style="font-family:'DM Mono',monospace; font-weight:700; color:var(--red);">− R$ ${totalSaidasMes.toFixed(2)}</span>
          </div>
          <div style="border-top:1px solid var(--border-light); padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:700;">Saldo</span>
            <span style="font-family:'DM Mono',monospace; font-size:1.1rem; font-weight:700; color:${saldoMes >= 0 ? 'var(--green)' : 'var(--red)'};">${saldoMes >= 0 ? '+' : '−'} R$ ${Math.abs(saldoMes).toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:0;">
        <div class="card-title">Esta semana <span style="font-size:11px; font-weight:400; color:var(--text-muted);">${semanaLabel}</span></div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; color:var(--text-muted);">Entradas</span>
            <span style="font-family:'DM Mono',monospace; font-weight:700; color:var(--green);">+ R$ ${totalEntradasSemana.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; color:var(--text-muted);">Saídas</span>
            <span style="font-family:'DM Mono',monospace; font-weight:700; color:var(--red);">− R$ ${totalSaidasSemana.toFixed(2)}</span>
          </div>
          <div style="border-top:1px solid var(--border-light); padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:700;">Saldo</span>
            <span style="font-family:'DM Mono',monospace; font-size:1.1rem; font-weight:700; color:${saldoSemana >= 0 ? 'var(--green)' : 'var(--red)'};">${saldoSemana >= 0 ? '+' : '−'} R$ ${Math.abs(saldoSemana).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">Visão semanal detalhada</div>
      <div id="financeiro-semanal" style="display:flex; flex-direction:column; gap:12px;"></div>
    </div>

    <div class="card">
      <div class="card-title">Exportar relatório</div>
      <div style="display:flex; gap:6px; margin-bottom:12px;">
        <button id="btn-exp-semana" class="btn btn-gold" style="flex:1; padding:0.5rem;" onclick="mostrarOpcoesExport('semana')">Semana</button>
        <button id="btn-exp-mes" class="btn btn-ghost" style="flex:1; padding:0.5rem;" onclick="mostrarOpcoesExport('mes')">Mês</button>
      </div>
      <div id="opcoes-semana" style="margin-bottom:12px;">
        <select id="semana-ano" style="margin-bottom:6px;"></select>
        <select id="semana-selecionar"></select>
      </div>
      <div id="opcoes-mes" style="display:none; margin-bottom:12px;">
        <select id="mes-ano" style="margin-bottom:6px;"></select>
        <select id="mes-selecionar"></select>
      </div>
      <button class="btn btn-gold btn-full" onclick="exportarRelatorio()">📥 Baixar CSV</button>
      <p style="font-size:11px; color:var(--text-muted); margin-top:8px;">Arquivo CSV compatível com Excel (separador ponto-e-vírgula)</p>
    </div>
  `;

  renderFinanceiroSemanal();
  mostrarOpcoesExport('semana');
}

function renderFinanceiroSemanal() {
  const container = document.getElementById('financeiro-semanal');
  if (!container) return;

  const mapaSemanas = {};

  historico.forEach(c => {
    const semana = getWeekKey(parseLocal(c.fechamento || c.data));
    if (!mapaSemanas[semana]) mapaSemanas[semana] = { entradas: [], saidas: [] };
    mapaSemanas[semana].entradas.push(c);
  });

  [...compras, ...saidas].forEach(s => {
    const semana = getWeekKey(parseLocal(s.data));
    if (!mapaSemanas[semana]) mapaSemanas[semana] = { entradas: [], saidas: [] };
    mapaSemanas[semana].saidas.push(s);
  });

  const semanas = Object.entries(mapaSemanas).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);

  if (!semanas.length) {
    container.innerHTML = '<div class="empty-state">Sem dados para exibir</div>';
    return;
  }

  const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  container.innerHTML = semanas.map(([semanaKey, dados]) => {
    const totalEnt = dados.entradas.reduce((s, c) => s + (c.totalFinal ?? c.total), 0);
    const totalSai = dados.saidas.reduce((s, c) => s + c.valor, 0);
    const saldo    = totalEnt - totalSai;
    const label    = semanaKey.split('|')[1] || semanaKey;

    // Agrupar por dia (chave YYYY-MM-DD)
    const porDia = {};
    dados.entradas.forEach(c => {
      const d = parseLocal(c.fechamento || c.data);
      const chave = localDateKey(d);
      if (!porDia[chave]) porDia[chave] = { entradas: [], saidas: [], diaSemana: d.getDay() };
      porDia[chave].entradas.push(c);
    });
    dados.saidas.forEach(s => {
      const d = parseLocal(s.data);
      const chave = localDateKey(d);
      if (!porDia[chave]) porDia[chave] = { entradas: [], saidas: [], diaSemana: d.getDay() };
      porDia[chave].saidas.push(s);
    });

    const diasOrdenados = Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0]));

    const diasHtml = diasOrdenados.map(([dataKey, dia]) => {
      const dLabel  = parseLocal(dataKey);
      const dataFmt = dLabel.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const nomeDia = DIAS_PT[dLabel.getDay()];
      const entDia  = dia.entradas.reduce((s, c) => s + (c.totalFinal ?? c.total), 0);
      const saiDia  = dia.saidas.reduce((s, c) => s + c.valor, 0);
      return `
        <div style="margin-bottom:10px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:5px; display:flex; justify-content:space-between;">
            <span>${nomeDia} ${dataFmt}</span>
            <span style="color:${(entDia - saiDia) >= 0 ? 'var(--green)' : 'var(--red)'};">${(entDia - saiDia) >= 0 ? '+' : '−'} R$ ${Math.abs(entDia - saiDia).toFixed(2)}</span>
          </div>
          ${dia.entradas.map(c => `
            <div style="font-size:12px; padding:5px 8px; margin-bottom:3px; background:var(--cream); border-radius:6px; display:flex; justify-content:space-between;">
              <span>${c.nome} · Mesa ${c.mesa}</span>
              <span style="font-weight:600; color:var(--green);">+ R$ ${(c.totalFinal ?? c.total).toFixed(2)}</span>
            </div>
          `).join('')}
          ${dia.saidas.map(s => `
            <div style="font-size:12px; padding:5px 8px; margin-bottom:3px; background:#fff5f5; border-radius:6px; display:flex; justify-content:space-between;">
              <span>${s.descricao || s.fornecedor || s.categoria}</span>
              <span style="font-weight:600; color:var(--red);">− R$ ${s.valor.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

    return `
      <div style="border:1px solid var(--border-light); border-radius:10px; overflow:hidden;">
        <div onclick="toggleSemanaDetalhes(this)" style="display:flex; justify-content:space-between; cursor:pointer; align-items:center; user-select:none; padding:0.875rem 1rem; background:var(--cream);">
          <strong style="font-size:13px;">${label}</strong>
          <div style="display:flex; gap:16px; align-items:center; font-size:13px;">
            <span style="color:var(--green); font-weight:600;">+ R$ ${totalEnt.toFixed(2)}</span>
            <span style="color:var(--red); font-weight:600;">− R$ ${totalSai.toFixed(2)}</span>
            <span style="font-weight:700; color:${saldo >= 0 ? 'var(--green)' : 'var(--red)'};">= R$ ${saldo.toFixed(2)}</span>
            <span style="color:var(--text-muted); font-size:11px;">▼</span>
          </div>
        </div>
        <div style="display:none; padding:1rem; background:white;" class="semana-detalhes">
          ${diasHtml || '<div class="empty-state">Sem registros</div>'}
        </div>
      </div>
    `;
  }).join('');
}

function toggleSemanaDetalhes(el) {
  const detalhes = el.nextElementSibling;
  if (detalhes) {
    const isOpen = detalhes.style.display !== 'none';
    detalhes.style.display = isOpen ? 'none' : 'block';
    const arrow = el.querySelector('span:last-child');
    if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
  }
}

function parseLocal(str) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(str)) ? str + 'T12:00:00' : str);
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekKey(date) {
  const src = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T12:00:00' : date;
  const d = new Date(src);
  if (isNaN(d)) return 'data-invalida|data-invalida';
  const diaSemana = d.getDay();
  const inicio    = new Date(d);
  inicio.setDate(d.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  inicio.setHours(12, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  const ano        = inicio.getFullYear();
  const chaveOrdem = localDateKey(inicio);
  const label      = inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
    ' – ' + fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + ano;
  return chaveOrdem + '|' + label;
}

async function adicionarSaidaAvulsa() {
  const data      = document.getElementById('saida-data').value;
  const valor     = parseFloat(document.getElementById('saida-valor').value);
  const descricao = document.getElementById('saida-desc').value.trim();
  const categoria = document.getElementById('saida-cat').value;
  if (!data) return showToast('Selecione a data', 'error');
  if (isNaN(valor) || valor <= 0) return showToast('Digite um valor válido', 'error');
  if (!descricao) return showToast('Digite uma descrição', 'error');
  try {
    const nova = await apiFetch('/saidas', { method: 'POST', body: { data, descricao, categoria, valor } });
    saidas.push(nova);
    document.getElementById('saida-data').value  = localDateKey(new Date());
    document.getElementById('saida-valor').value = '';
    document.getElementById('saida-desc').value  = '';
    renderListaSaidas();
    showToast('Saída registrada!');
  } catch (err) {
    showToast('Erro ao registrar saída: ' + err.message, 'error');
  }
}

// =================== EXPORTAÇÃO ===================
let tipoExportAtual  = 'semana';
let semanaSelecionada = null;
let mesSelecionado    = null;

function mostrarOpcoesExport(tipo) {
  tipoExportAtual = tipo;

  const btnSemana = document.getElementById('btn-exp-semana');
  const btnMes    = document.getElementById('btn-exp-mes');
  const opSemana  = document.getElementById('opcoes-semana');
  const opMes     = document.getElementById('opcoes-mes');

  if (tipo === 'semana') {
    if (btnSemana) btnSemana.className = 'btn btn-gold';
    if (btnMes) btnMes.className = 'btn btn-ghost';
    if (opSemana) opSemana.style.display = 'block';
    if (opMes) opMes.style.display = 'none';
    carregarAnosSemanas();
  } else {
    if (btnSemana) btnSemana.className = 'btn btn-ghost';
    if (btnMes) btnMes.className = 'btn btn-gold';
    if (opSemana) opSemana.style.display = 'none';
    if (opMes) opMes.style.display = 'block';
    carregarAnosMeses();
  }
}

function carregarAnosSemanas() {
  const selectAno    = document.getElementById('semana-ano');
  const selectSemana = document.getElementById('semana-selecionar');
  if (!selectAno || !selectSemana) return;

  const anos = [...new Set(historico.map(c => { const d = new Date(c.fechamento || c.data); return d.getFullYear(); }))].sort((a, b) => b - a);
  if (anos.length === 0) anos.push(new Date().getFullYear());

  selectAno.innerHTML = anos.map(a => `<option value="${a}" ${a === new Date().getFullYear() ? 'selected' : ''}>${a}</option>`).join('');
  selectAno.onchange  = () => carregarSemanasDoAno(selectAno.value);
  carregarSemanasDoAno(selectAno.value);
}

function carregarSemanasDoAno(ano) {
  const select = document.getElementById('semana-selecionar');
  if (!select) return;

  const semanas    = [];
  const inicioAno  = new Date(ano, 0, 1);
  const fimAno     = new Date(ano, 11, 31);
  let current      = new Date(inicioAno);
  current.setDate(current.getDate() + (7 - current.getDay() + 1) % 7);
  let numSemana    = 1;

  while (current <= fimAno) {
    const segunda = new Date(current);
    const domingo = new Date(current);
    domingo.setDate(domingo.getDate() + 6);
    const label = `${numSemana}ª sem (${segunda.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} - ${domingo.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})})`;
    semanas.push({ num: numSemana, label, segunda: localDateKey(segunda) });
    current.setDate(current.getDate() + 7);
    numSemana++;
  }

  const agora      = new Date();
  const anoAtual   = agora.getFullYear();
  const semanaAtual = Math.ceil((agora - new Date(anoAtual, 0, 1)) / (7 * 24 * 60 * 60 * 1000));
  select.innerHTML = semanas.map(s => `<option value="${s.num}|${s.segunda}" ${anoAtual == ano && s.num === semanaAtual ? 'selected' : ''}>${s.label}</option>`).join('');
}

function carregarAnosMeses() {
  const selectAno = document.getElementById('mes-ano');
  const selectMes = document.getElementById('mes-selecionar');
  if (!selectAno || !selectMes) return;

  const anos = [...new Set(historico.map(c => { const d = new Date(c.fechamento || c.data); return d.getFullYear(); }))].sort((a, b) => b - a);
  if (anos.length === 0) anos.push(new Date().getFullYear());

  const agora = new Date();
  selectAno.innerHTML = anos.map(a => `<option value="${a}" ${a === agora.getFullYear() ? 'selected' : ''}>${a}</option>`).join('');
  selectAno.onchange  = () => carregarMesesDoAno(selectAno.value);
  carregarMesesDoAno(selectAno.value);
}

function carregarMesesDoAno(ano) {
  const select = document.getElementById('mes-selecionar');
  if (!select) return;
  const meses   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const agora   = new Date();
  const mesAtual = agora.getMonth();
  select.innerHTML = meses.map((m, i) => `<option value="${i}" ${ano == agora.getFullYear() && i === mesAtual ? 'selected' : ''}>${m}</option>`).join('');
}

function obterParametros() {
  const agora = new Date();
  let dataInicio, dataFim, nomeArquivo;

  if (tipoExportAtual === 'semana') {
    const semanaVal  = document.getElementById('semana-selecionar').value;
    const [numSemana, segundaStr] = semanaVal.split('|');
    const ano        = document.getElementById('semana-ano').value;
    dataInicio       = parseLocal(segundaStr);
    dataInicio.setHours(0, 0, 0, 0);
    dataFim          = new Date(dataInicio);
    dataFim.setDate(dataFim.getDate() + 6);
    dataFim.setHours(23, 59, 59, 999);
    nomeArquivo      = `cafe-aroma-SEMANA-${String(numSemana).padStart(2, '0')}-${ano}.csv`;
  } else {
    const mes   = parseInt(document.getElementById('mes-selecionar').value);
    const ano   = parseInt(document.getElementById('mes-ano').value);
    dataInicio  = new Date(ano, mes, 1, 0, 0, 0, 0);
    dataFim     = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
    nomeArquivo = `cafe-aroma-MES-${String(mes + 1).padStart(2, '0')}-${ano}.csv`;
  }

  return { tipo: tipoExportAtual, dataInicio, dataFim, nomeArquivo };
}

function exportarRelatorio() {
  const params = obterParametros();
  const { dataInicio, dataFim, nomeArquivo } = params;

  const filtrarEntrada = c => { const d = parseLocal(c.fechamento || c.data); return d >= dataInicio && d <= dataFim; };
  const filtrarSaida   = s => { const d = parseLocal(s.data); return d >= dataInicio && d <= dataFim; };

  let dados = [];

  historico.filter(filtrarEntrada).forEach(c => {
    const dataExibir = c.dataFechamento || (c.fechamento ? new Date(c.fechamento).toLocaleDateString('pt-BR') : '--');
    dados.push({ data: dataExibir, tipo: 'Entrada', descricao: `${c.nome} (Mesa ${c.mesa})`, fornecedor: '--', categoria: 'Venda', valor: c.totalFinal ?? c.total, pagamento: c.formaPagamento || '--', nf: '--' });
  });

  [...compras, ...saidas].filter(filtrarSaida).forEach(s => {
    dados.push({ data: parseLocal(s.data).toLocaleDateString('pt-BR'), tipo: 'Saída', descricao: s.descricao || s.fornecedor || '--', fornecedor: s.fornecedor || '--', categoria: s.categoria, valor: -s.valor, pagamento: s.pagamento || '--', nf: s.nf || '--' });
  });

  if (!dados.length) return showToast('Nenhum dado para exportar no período', 'error');

  const bom    = '\uFEFF';
  const header = 'Data;Tipo;Descrição;Fornecedor;Categoria;Valor;Forma de Pagamento;NF\n';
  const rows   = dados.map(d =>
    `"${d.data}";"${d.tipo}";"${d.descricao}";"${d.fornecedor}";"${d.categoria}";${d.valor.toFixed(2).replace('.', ',')};"${d.pagamento}";"${d.nf}"`
  ).join('\n');

  const csv  = bom + header + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href  = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.click();
  showToast(`CSV exportado: ${nomeArquivo}`, 'success');
}

// =================== BADGE E UTILS ===================
function updateBadge() {
  document.getElementById('badge-abertas').textContent = comandas.filter(c => c.status === 'aberta').length;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent  = msg;
  t.className    = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}


// =================== KEYBOARD SHORTCUTS ===================
function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      const pageNovaComanda = document.getElementById('page-nova-comanda');
      if (pageNovaComanda && pageNovaComanda.classList.contains('active')) {
        e.preventDefault();
        abrirComanda();
      }
    }
  });
}

function setMesaSuggestions() {
  let dataList = document.getElementById('mesas-list');
  if (!dataList) {
    dataList = document.createElement('datalist');
    dataList.id = 'mesas-list';
    document.body.appendChild(dataList);
  }
  const mesas = JSON.parse(config.mesas || '[1,2,3,4,5,6,7,8,9,10]');
  dataList.innerHTML = mesas.map(m => `<option value="${esc(m)}">`).join('');
}

// =================== INIT ===================
initializeKeyboardShortcuts();
checkSession();
