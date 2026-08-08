CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
--  Krish-A · маркетплейс ЖК + кредитный брокер
--  PostgreSQL-схема (боевой бэкенд). Прототип на фронте
--  повторяет эти же сущности в localStorage.
-- ============================================================

-- Роли: super | dev_admin | manager | client
CREATE TYPE user_role AS ENUM ('super', 'dev_admin', 'manager', 'client');
CREATE TYPE apt_status AS ENUM ('free', 'booked', 'sold');
CREATE TYPE realty_type AS ENUM ('underConsRealEstate', 'builtRealEstate');
CREATE TYPE order_state AS ENUM ('new', 'approved', 'ready', 'issued', 'rejected');

-- Строительные компании (застройщики)
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  bin             varchar(12),
  city            text,
  logo_url        text,
  -- главный админ может делегировать право заводить новые компании
  can_create_companies boolean NOT NULL DEFAULT false,
  created_by      uuid,            -- кто завёл (super или делегированный)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Пользователи. companyId обязателен для dev_admin и manager, NULL для super и client
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          user_role NOT NULL,
  company_id    uuid REFERENCES companies(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  email         text UNIQUE,
  phone         varchar(11),
  password_hash text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON users(company_id);

-- Жилые комплексы. public=true → виден клиентам в общем каталоге,
-- false → только менеджерам/админам этой компании
CREATE TABLE complexes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  city          text NOT NULL,
  district      text,
  address       text,
  class         text,             -- Комфорт / Комфорт+ / Бизнес / Премиум
  realty_type   realty_type DEFAULT 'underConsRealEstate',
  deadline      text,             -- срок сдачи
  price_from    numeric,          -- от, ₸
  cover_url     text,
  is_public     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON complexes(company_id);
CREATE INDEX ON complexes(city);
CREATE INDEX ON complexes(is_public);

-- Галерея комплекса (планировки, площади, рендеры)
CREATE TABLE complex_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id   uuid NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  url          text NOT NULL,
  sort_order   int DEFAULT 0
);

-- Сток квартир (в т.ч. импорт из Excel)
CREATE TABLE apartments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id   uuid NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  block        text,
  floor        int,
  rooms        int,
  area         numeric,           -- м²
  price        numeric,           -- ₸
  image_url    text,
  status       apt_status NOT NULL DEFAULT 'free',
  external_id  text,              -- код из выгрузки застройщика
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON apartments(complex_id);
CREATE INDEX ON apartments(status);

-- Какие менеджеры к каким ЖК прикреплены (доступ на отправку заявок)
CREATE TABLE manager_complexes (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complex_id   uuid NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, complex_id)
);

-- Банковские коннекторы (интеграция) — на компанию
CREATE TABLE bank_connectors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text NOT NULL,
  env          text DEFAULT 'test',
  enabled      boolean DEFAULT false,
  rest_url     text,
  soap_url     text,
  version      text,
  source       text,
  sign_type    text DEFAULT 'AITU',
  token        text,              -- в бэкенде хранить в секрете/Vault
  seller       jsonb,             -- name/bin/branchCode/manager...
  field_map    jsonb,             -- маппинг StartMortgage
  states       jsonb,             -- маппинг UpdateOrderState
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON bank_connectors(company_id);

-- Банковские продукты коннектора
CREATE TABLE bank_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id  uuid NOT NULL REFERENCES bank_connectors(id) ON DELETE CASCADE,
  internal      text,
  code          text,             -- desiredProductType (напр. BrokerMortgage)
  product_ref   text,             -- ProductReferenceId (ALTNM / ALTNM INS)
  kind          text,             -- mortgage / installment
  rate          numeric,
  enabled       boolean DEFAULT true
);

-- Заявки/сделки
CREATE TABLE applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           text UNIQUE,
  order_id      text,             -- id заявки в банке
  company_id    uuid REFERENCES companies(id),
  complex_id    uuid REFERENCES complexes(id),
  apartment_id  uuid REFERENCES apartments(id),
  created_by    uuid REFERENCES users(id),   -- менеджер или клиент
  client_name   text,
  client_iin    varchar(12),
  client_phone  varchar(11),
  price         numeric,
  down_payment  numeric,
  term_months   int,
  product       jsonb,            -- выбранный оффер
  state         order_state NOT NULL DEFAULT 'new',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON applications(company_id);
CREATE INDEX ON applications(state);

-- Аудит важных действий (кто завёл компанию, отправил заявку и т.д.)
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  action      text,
  entity      text,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
