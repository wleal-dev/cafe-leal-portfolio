-- =============================================================
-- CAFÉ AROMA — Schema PostgreSQL
-- Baseado nas estruturas reais do app.js (auditoria ETAPA 1)
-- =============================================================

-- -------------------------------------------------------------
-- USERS
-- Substitui array USERS hardcoded no frontend
-- role: 'Gerente' | 'Atendente' | 'Financeiro'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id       SERIAL PRIMARY KEY,
  username VARCHAR(50)  NOT NULL UNIQUE,
  senha    VARCHAR(255) NOT NULL,          -- bcrypt hash
  nome     VARCHAR(100) NOT NULL,
  role     VARCHAR(20)  NOT NULL CHECK (role IN ('Gerente', 'Atendente', 'Financeiro')),
  ativo    BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- CATEGORIAS
-- cl_categorias: [{ id, nome }]
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(100) NOT NULL,
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- PRODUTOS
-- cl_produtos: [{ id, nome, preco, categoriaId }]
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produtos (
  id           SERIAL  PRIMARY KEY,
  nome         VARCHAR(150) NOT NULL,
  preco        NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- COMANDAS (abertas)
-- cl_comandas: [{ id, nome, mesa, total, hora, data, abertura,
--                 operador, status, parentId }]
-- id original era Date.now() — aqui usamos SERIAL
-- parentId vira parent_id (comanda dividida)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comandas (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(150) NOT NULL,
  mesa       VARCHAR(50),
  total      NUMERIC(10,2) NOT NULL DEFAULT 0,
  hora       VARCHAR(5),               -- "HH:MM"
  data       VARCHAR(10),              -- "DD/MM/YYYY"
  abertura   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  operador   VARCHAR(100),
  status     VARCHAR(20)  NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta')),
  parent_id  INTEGER REFERENCES comandas(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- COMANDA_ITENS
-- comanda.itens: [{ nome, qty, preco, nota }]
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comanda_itens (
  id         SERIAL  PRIMARY KEY,
  comanda_id INTEGER NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  nome       VARCHAR(150) NOT NULL,
  qty        INTEGER      NOT NULL CHECK (qty > 0),
  preco      NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  nota       TEXT,
  criado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- HISTORICO (comandas fechadas / canceladas)
-- cl_historico: comanda + campos de fechamento + pagamento
-- Tabela separada (igual ao frontend — não mistura com comandas)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historico (
  id                  SERIAL PRIMARY KEY,
  nome                VARCHAR(150) NOT NULL,
  mesa                VARCHAR(50),
  total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  hora                VARCHAR(5),
  data                VARCHAR(10),
  abertura            TIMESTAMPTZ,
  operador            VARCHAR(100),
  status              VARCHAR(20) NOT NULL CHECK (status IN ('fechada', 'cancelada')),
  hora_fechamento     VARCHAR(5),
  data_fechamento     VARCHAR(10),
  fechamento          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  desconto            NUMERIC(10,2) NOT NULL DEFAULT 0,
  desconto_percentual NUMERIC(5,2)  NOT NULL DEFAULT 0,
  total_final         NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento     VARCHAR(20) CHECK (
                        forma_pagamento IN ('Dinheiro','Débito','Crédito','Pix','Cancelada')
                      ),
  operador_fechamento VARCHAR(100),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- HISTORICO_ITENS
-- Snapshot dos itens no momento do fechamento
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historico_itens (
  id           SERIAL  PRIMARY KEY,
  historico_id INTEGER NOT NULL REFERENCES historico(id) ON DELETE CASCADE,
  nome         VARCHAR(150) NOT NULL,
  qty          INTEGER      NOT NULL,
  preco        NUMERIC(10,2) NOT NULL,
  nota         TEXT,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- FORNECEDORES
-- cl_fornecedores: [{ id, nome, cnpj, tipo }]
-- tipo: 'Mercado' | 'Fornecedor' | 'Outro'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fornecedores (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(150) NOT NULL,
  cnpj      VARCHAR(20),
  tipo      VARCHAR(20) CHECK (tipo IN ('Mercado', 'Fornecedor', 'Outro')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- COMPRAS
-- cl_compras: [{ id, data, fornecedor, cnpj, nf, valor,
--               pagamento, status, categoria, itens, obs, foto }]
-- foto = base64 dataURL (pode ser grande → TEXT)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras (
  id         SERIAL PRIMARY KEY,
  data       DATE         NOT NULL,
  fornecedor VARCHAR(150),
  cnpj       VARCHAR(20),
  nf         VARCHAR(50),
  valor      NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  pagamento  VARCHAR(20) CHECK (pagamento IN ('Dinheiro','Débito','Crédito','Pix')),
  status     VARCHAR(20) NOT NULL DEFAULT 'Pago' CHECK (status IN ('Pago','A pagar')),
  categoria  VARCHAR(50) CHECK (
               categoria IN ('Insumos','Contas Fixas','Fornecedores','Retirada de Caixa','Outros')
             ),
  itens      TEXT,         -- texto livre: "5kg café, 10L leite"
  obs        TEXT,
  foto       TEXT,         -- base64 dataURL (opcional)
  criado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- SAIDAS (saídas avulsas de caixa)
-- cl_saidas: [{ id, data, descricao, categoria, valor }]
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saidas (
  id        SERIAL PRIMARY KEY,
  data      DATE         NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  categoria VARCHAR(100),
  valor     NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- CAIXAS (abertura e fechamento de turno/dia)
-- Registra o troco inicial, totais por forma de pagamento,
-- valor contado e a diferença (sobra/falta)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caixas (
  id              SERIAL PRIMARY KEY,
  data            DATE          NOT NULL,
  hora_abertura   TIMESTAMPTZ   NOT NULL,
  hora_fechamento TIMESTAMPTZ,
  valor_inicial   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_dinheiro  NUMERIC(10,2),
  total_pix       NUMERIC(10,2),
  total_debito    NUMERIC(10,2),
  total_credito   NUMERIC(10,2),
  total_calculado NUMERIC(10,2),
  total_contado   NUMERIC(10,2),
  diferenca       NUMERIC(10,2),
  aberto_por      VARCHAR(100),
  fechado_por     VARCHAR(100),
  status          VARCHAR(20)   DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  criado_em       TIMESTAMPTZ   DEFAULT NOW()
);

-- -------------------------------------------------------------
-- CONFIGURACOES (chave-valor)
-- Substitui cl_budget_semanal e cl_mesas
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave     VARCHAR(100) PRIMARY KEY,
  valor     TEXT         NOT NULL,
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- ÍNDICES (performance nas consultas mais comuns)
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_comanda_itens_comanda_id  ON comanda_itens(comanda_id);
CREATE INDEX IF NOT EXISTS idx_historico_itens_historico ON historico_itens(historico_id);
CREATE INDEX IF NOT EXISTS idx_historico_fechamento      ON historico(fechamento);
CREATE INDEX IF NOT EXISTS idx_compras_data              ON compras(data);
CREATE INDEX IF NOT EXISTS idx_saidas_data               ON saidas(data);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria        ON produtos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_caixas_data               ON caixas(data);
CREATE INDEX IF NOT EXISTS idx_caixas_status             ON caixas(status);

-- =============================================================
-- DADOS INICIAIS
-- =============================================================

-- Usuários padrão (senhas em bcrypt — geradas pelo seed.js)
-- admin123 → $2b$10$... / caixa123 → $2b$10$...
-- Inseridos pelo seed.js, não hardcoded aqui para não expor hash no SQL

-- Categorias padrão (espelho exato do frontend)
INSERT INTO categorias (nome) VALUES
  ('Cafés'),
  ('Bolos'),
  ('Sucos'),
  ('Salgados')
ON CONFLICT DO NOTHING;

-- Configurações padrão
INSERT INTO configuracoes (chave, valor) VALUES
  ('budget_semanal', '800'),
  ('mesas', '[1,2,3,4,5,6,7,8,9,10]')
ON CONFLICT (chave) DO NOTHING;
