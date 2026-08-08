const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS kv_store (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
}

app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get("/kv", async (req, res) => {
  try {
    const prefix = String(req.query.prefix || "");
    const r = await pool.query("SELECT key FROM kv_store WHERE key LIKE $1", [prefix + "%"]);
    res.json({ keys: r.rows.map((x) => x.key) });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/kv/:key", async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM kv_store WHERE key = $1", [req.params.key]);
    res.json(r.rows[0] ? { value: r.rows[0].value } : { value: null });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.put("/kv/:key", async (req, res) => {
  try {
    const value = req.body && req.body.value != null ? req.body.value : "";
    await pool.query(
      `INSERT INTO kv_store(key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, value]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.delete("/kv/:key", async (req, res) => {
  try { await pool.query("DELETE FROM kv_store WHERE key = $1", [req.params.key]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

/* --- Прокси к банку (заглушка). Здесь на сервере хранится токен банка,
   собирается StartMortgage и принимаются колбэки SendOffers/UpdateOrderState.
   Реальные вызовы к Altyn подставляются вместо mock-ответа ниже. --- */
app.post("/bank/:connectorId/start-mortgage", async (req, res) => {
  // TODO: собрать тело StartMortgage по маппингу и отправить в банк (REST).
  const orderId = "ORD-" + Math.floor(100000 + Math.random() * 899999);
  res.json({ order_id: orderId, status: "accepted" });
});
app.post("/bank/callbacks/send-offers", (req, res) => res.json({ ResponseCode: "0" }));
app.post("/bank/callbacks/update-order-state", (req, res) => res.json({ ResponseCode: "0" }));

const port = process.env.PORT || 3000;
init()
  .then(() => app.listen(port, () => console.log("krish-a api on :" + port)))
  .catch((e) => { console.error("init failed", e); process.exit(1); });
