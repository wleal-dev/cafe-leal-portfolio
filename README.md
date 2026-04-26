# Café Aroma — Sistema de Gestão para Cafeteria

Sistema de ponto de venda (PDV) e gestão operacional completo. Gerencia comandas, caixa, produtos, compras, fornecedores e relatórios financeiros.

## Demo online

**[cafe-aroma-portfolio.vercel.app](https://cafe-aroma-portfolio.vercel.app)**

> **Usuário:** `demo` | **Senha:** `Demo@1234`

O usuário demo tem acesso de leitura a todas as telas. Para testar escrita, suba o projeto localmente com o usuário `admin`.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript Vanilla (SPA) |
| Backend | Node.js + Express.js |
| Banco de dados | PostgreSQL (Supabase) |
| Auth | JWT + bcrypt |
| Deploy | Vercel |

## Funcionalidades

- **Comandas** — abertura, edição de itens, divisão de conta, desconto gerencial, fechamento com forma de pagamento e troco
- **Caixa** — abertura com fundo inicial, fechamento com conferência física, resumo por forma de pagamento
- **Produtos e Categorias** — CRUD completo, soft delete
- **Compras e Fornecedores** — registro de notas fiscais, controle de pagamento, upload de foto
- **Saídas de caixa** — lançamentos avulsos
- **Relatórios** — ticket médio, horário de pico, produtos mais vendidos
- **Usuários** — três perfis: Gerente, Atendente e Financeiro

---

## Setup local

**Pré-requisitos:** Node.js v14+ e PostgreSQL instalado localmente.

```bash
# 1. Clonar e instalar dependências
git clone https://github.com/wleal-dev/cafe-aroma-portfolio
cd cafe-aroma-portfolio/backend
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env e ajuste DATABASE_URL para o seu PostgreSQL local

# 3. Criar tabelas e popular dados de demonstração
node seed.js

# 4. Iniciar o servidor
npm start          # produção
npm run dev        # desenvolvimento (hot reload)
```

Acesse `http://localhost:3000`.

| Usuário | Senha | Perfil |
|---------|-------|--------|
| `demo`  | `Demo@1234`  | Gerente (somente leitura) |

---

## Deploy online (Supabase + Vercel)

### 1. Banco de dados — Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (free tier)
2. Vá em **Project Settings → Database → URI** e copie a connection string
3. Execute o seed apontando para o Supabase:
   ```bash
   DATABASE_URL="postgresql://postgres:<senha>@db.<projeto>.supabase.co:5432/postgres" \
   SENHA_ADMIN=Admin@1234 SENHA_CAIXA=Caixa@1234 \
   node backend/seed.js
   ```

### 2. Servidor — Vercel

1. Conecte o repositório no [vercel.com](https://vercel.com)
2. Adicione as variáveis de ambiente no painel do projeto:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | Connection string do Supabase |
| `JWT_SECRET` | Secret aleatório de 32+ caracteres |
| `SENHA_ADMIN` | Senha do admin |
| `SENHA_CAIXA` | Senha do caixa |
| `RESET_SECRET` | Secret para o endpoint de reset |

3. Faça push — Vercel faz o deploy automaticamente.

### 3. Reset automático (GitHub Actions)

Para evitar que testes de usuários encham o banco gratuito, o workflow `.github/workflows/reset-demo.yml` reseta o banco diariamente às 3h BRT.

Configure os seguintes secrets no repositório GitHub (**Settings → Secrets → Actions**):

| Secret | Valor |
|--------|-------|
| `VERCEL_URL` | URL do seu deploy (ex: `https://cafe-aroma.vercel.app`) |
| `RESET_SECRET` | Mesmo valor da env var `RESET_SECRET` do Vercel |

O workflow também pode ser disparado manualmente pela aba **Actions** do GitHub.

---

## Estrutura do projeto

```
├── index.html                  # SPA principal
├── app.js                      # Lógica do frontend
├── styles.css                  # Design system
├── vercel.json                 # Configuração de deploy
├── .github/workflows/
│   └── reset-demo.yml          # Reset diário do banco demo
└── backend/
    ├── server.js               # Entry point Express
    ├── db.js                   # Pool de conexão PostgreSQL
    ├── schema.sql              # Schema do banco
    ├── seed.js                 # Popular banco com dados de demonstração
    ├── reset-db.js             # Limpar banco (mantém schema)
    ├── middleware/
    │   ├── auth.js             # Verificação JWT
    │   ├── checkRole.js        # Controle de acesso por perfil
    │   └── demoGuard.js        # Bloqueia escrita para usuário demo
    └── routes/                 # auth, admin, produtos, comandas, caixa...
```

---

## Segurança

- **JWT** com expiração de 8h e validação de comprimento mínimo (32 chars)
- **Rate limiting** no login: 5 tentativas por 15 minutos
- **bcrypt** com salt 10 para hashing de senhas (mínimo 8 chars, maiúscula, número e especial)
- **Controle de acesso por perfil** em todas as rotas sensíveis (Gerente, Atendente, Financeiro)
- **Demo guard**: usuário `demo` só pode fazer leitura (GET) — qualquer escrita retorna 403
- **Escape de HTML** no frontend para prevenção de XSS
- **Helmet.js** para headers de segurança (CSP, X-Frame-Options, etc.)
- **Reset diário** via GitHub Actions para manter o banco de demo limpo
