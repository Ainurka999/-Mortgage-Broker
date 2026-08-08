import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

/* ============================================================
   KRISH-A · маркетплейс ЖК Казахстана + кредитный брокер
   Роли: super (главный админ) · dev_admin (админ застройщика)
         · manager · client. Данные — в localStorage (прототип),
   структура повторяет db/schema.sql.
   ============================================================ */

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');`;
const C = {
  bg: "#070C15", panel: "#0E1826", panel2: "#12233A", ink: "#EAF6FB", sub: "#8AA3B8", line: "#1E3550",
  brand: "#27D3EE", brandDk: "#0EA5B7", brandSoft: "#0F2A3A",
  gold: "#E0B25A", indigo: "#6366F1", indigoSoft: "#1B2450",
  green: "#34D399", greenSoft: "#123528", amber: "#E0B25A", red: "#F87171", sidebar: "#060B12",
};
const F = { fontFamily: '"Museo Sans Cyrl", sans-serif' };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n || 0));
const uid = (p = "id") => p + "-" + Math.random().toString(36).slice(2, 9);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nowD = () => new Date().toISOString().slice(0, 10);

function validateIin(raw) {
  const iin = String(raw).replace(/\D/g, ""); if (iin.length !== 12) return false;
  const w1 = [1,2,3,4,5,6,7,8,9,10,11], w2 = [3,4,5,6,7,8,9,10,11,1,2];
  let s = 0; for (let i=0;i<11;i++) s += +iin[i]*w1[i]; let c = s%11;
  if (c===10){ let s2=0; for(let i=0;i<11;i++) s2+=+iin[i]*w2[i]; c=s2%11; if(c===10) return false; }
  return c === +iin[11];
}
const phoneD = (r) => { let d=String(r).replace(/\D/g,""); if(d[0]==="8") d="7"+d.slice(1); return d.slice(0,11); };
const validPhone = (r) => { const d=phoneD(r); return d.length===11 && d[0]==="7"; };
const fmtPhone = (r) => { const d=phoneD(r); if(!d) return ""; let s="+7"; if(d.length>1)s+=" ("+d.slice(1,4); if(d.length>=5)s+=") "+d.slice(4,7); if(d.length>=8)s+="-"+d.slice(7,9); if(d.length>=10)s+="-"+d.slice(9,11); return s; };

const CITIES = ["Алматы", "Астана", "Шымкент", "Караганда", "Актобе"];
const CLASSES = ["Комфорт", "Комфорт+", "Бизнес", "Премиум"];

/* ---- Банковский коннектор (шаблон Altyn JsonMortgage) ------------ */
const altynConnector = (companyId) => ({
  id: uid("bank"), companyId, name: "Altyn Bank · Online Ipoteka", env: "test", enabled: true,
  restUrl: "http://ala33535.hsbk.nb:7900/JsonMortgage", soapUrl: "http://ala33535.hsbk.nb:7806/esb/mortgage/v1.0",
  version: "TL 1.1", source: "Partner", signType: "AITU", token: "",
  seller: { name: "", bin: "", branchCode: "GPM000011", managerPhone: "" },
  products: [
    { internal: "Ипотека", code: "BrokerMortgage", productRef: "ALTNM", kind: "mortgage", rate: 14, enabled: true },
    { internal: "7‑20‑25", code: "72025", productRef: "ALTNM", kind: "mortgage", rate: 7, enabled: true },
    { internal: "Рассрочка (Altyn‑i)", code: "installmentMortgage", productRef: "ALTNM INS", kind: "installment", rate: 0, enabled: true },
  ],
  fieldMap: [
    { group: "Заявка", path: "body[].orderNumber", label: "Номер заявки", src: "order.ref", req: true },
    { group: "Заявка", path: "body[].desiredProductType", label: "Тип продукта", src: "product.code", req: true },
    { group: "Заявка", path: "body[].amount", label: "Сумма займа", src: "order.amount", req: true },
    { group: "Заявка", path: "body[].initialSum", label: "Первонач. взнос", src: "order.down", req: true },
    { group: "Клиент", path: "customer[].taxCode", label: "ИИН", src: "client.iin", req: true },
    { group: "Клиент", path: "customer[].mobilePhone", label: "Телефон", src: "client.phone", req: true },
    { group: "Объект", path: "complex[].name", label: "ЖК", src: "object.complexName", req: true },
    { group: "Объект", path: "complex[].marketCost", label: "Стоимость", src: "object.marketCost", req: true },
  ],
  states: [
    { state: "approve", title: "Одобрено", internal: "approved" },
    { state: "reject", title: "Отказ", internal: "rejected" },
    { state: "readyRegistration", title: "Готов к регистрации", internal: "ready" },
    { state: "signed", title: "Займ выдан", internal: "issued" },
  ],
});

/* ---- Стартовые данные (сид) -------------------------------------- */
function seedDB() {
  const c1 = "co-hayat", c2 = "co-bi";
  const companies = [
    { id: c1, name: "Hayat Construction Group", bin: "151040016771", city: "Алматы", canCreateCompanies: false },
    { id: c2, name: "BI Group", bin: "051040004147", city: "Астана", canCreateCompanies: false },
  ];
  const users = [
    { id: "u-super", role: "super", companyId: null, fullName: "Главный админ", email: "admin@krish-a.kz", phone: "77010000000", password: "admin" },
    { id: "u-h-adm", role: "dev_admin", companyId: c1, fullName: "Админ Hayat", email: "admin@hayat.kz", phone: "77016167773", password: "hayat" },
    { id: "u-h-mgr", role: "manager", companyId: c1, fullName: "Менеджер Hayat", email: "mgr@hayat.kz", phone: "77017778899", password: "mgr", complexes: ["cx-meliora"] },
    { id: "u-bi-adm", role: "dev_admin", companyId: c2, fullName: "Админ BI", email: "admin@bi.kz", phone: "77012223344", password: "bi" },
    { id: "u-client", role: "client", companyId: null, fullName: "Клиент Демо", email: "client@mail.kz", phone: "77052223344", password: "client" },
  ];
  const complexes = [
    { id: "cx-meliora", companyId: c1, name: "Hayat Meliora", city: "Алматы", district: "Медеуский", address: "ул. Сагадат Нурмагамбетов, 28Б", class: "Премиум", deadline: "II кв. 2024", priceFrom: 32000000, cover: "", isPublic: true, hue: 34 },
    { id: "cx-apart", companyId: c1, name: "Hayat Apartments", city: "Алматы", district: "Алатауский", address: "ул. Райымбек Батыра, 161", class: "Комфорт+", deadline: "II кв. 2024", priceFrom: 22000000, cover: "", isPublic: true, hue: 205 },
    { id: "cx-besagash", companyId: c1, name: "Besagash", city: "Алматы", district: "Алатауский", address: "ул. Райымбек Батыра, 167", class: "Комфорт+", deadline: "IV кв. 2023", priceFrom: 20000000, cover: "", isPublic: false, hue: 150 },
    { id: "cx-arman", companyId: c2, name: "Arman Qala", city: "Астана", district: "Есиль", address: "кв-л 189", class: "Комфорт", deadline: "I кв. 2025", priceFrom: 18400000, cover: "", isPublic: true, hue: 262 },
    { id: "cx-aisar", companyId: c2, name: "Aisar", city: "Астана", district: "Есиль", address: "ул. E-321, 6/2", class: "Комфорт", deadline: "IV кв. 2024", priceFrom: 20700000, cover: "", isPublic: true, hue: 20 },
  ];
  const apartments = [
    { id: uid("apt"), complexId: "cx-meliora", block: "1", floor: 8, rooms: 2, area: 64.2, price: 41000000, status: "free", image: "" },
    { id: uid("apt"), complexId: "cx-meliora", block: "1", floor: 9, rooms: 3, area: 88.3, price: 58000000, status: "free", image: "" },
    { id: uid("apt"), complexId: "cx-apart", block: "2", floor: 5, rooms: 1, area: 38.0, price: 22500000, status: "free", image: "" },
    { id: uid("apt"), complexId: "cx-arman", block: "A", floor: 7, rooms: 2, area: 57.5, price: 26000000, status: "free", image: "" },
  ];
  const h = altynConnector(c1); h.seller = { name: "Hayat Construction Group", bin: "151040016771", branchCode: "GPM000011", managerPhone: "77016167773" };
  const connectors = [
    h,
    { ...altynConnector(c1), id: uid("bank"), name: "Freedom Bank · Онлайн-ипотека", enabled: false, restUrl: "", soapUrl: "" },
    { ...altynConnector(c2), name: "Altyn Bank · Online Ipoteka" },
  ];
  companies.forEach((c) => { c.requisites = c.requisites || { name: c.name, bin: c.bin, address: "", director: "", phone: "", iik: "", bank: "" }; c.site = c.site || { enabled: c.id === "co-hayat", domain: c.id === "co-hayat" ? "hayat.krish-a.kz" : "" }; });
  return { companies, users, complexes, apartments, connectors, applications: [], devRequests: [], settings: { brokerDoc: DEFAULT_DOC } };
}

/* ---- Расчёт офферов ---------------------------------------------- */
const annuity = (loan, rate, m) => { const r = rate/100/12, p = loan; return r===0 ? p/m : (p*r)/(1-Math.pow(1+r,-m)); };
function offersForCompany(connectors, companyId, priceT, downT, months) {
  const loan = Math.max(0, priceT - downT);
  return connectors.filter((c) => c.companyId === companyId && c.enabled)
    .flatMap((c) => c.products.filter((p) => p.enabled).map((p) => {
      const term = p.kind === "installment" ? Math.min(months, 36) : months;
      return { id: c.id + ":" + p.code, bank: c.name.split(" · ")[0], name: p.internal, kind: p.kind, rate: p.rate, gesv: p.rate===0?0:+(p.rate+1.2).toFixed(1), loan, term, monthly: Math.round(annuity(loan, p.rate, term)), productRef: p.productRef };
    }))
    .sort((a, b) => a.rate - b.rate);
}

/* ============================================================ */
export default function App() {
  const [db, setDb] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { (async () => {
    try {
      const r = await window.storage.get("krisha:db");
      setDb(r?.value ? JSON.parse(r.value) : seedDB());
      const s = await window.storage.get("krisha:session");
      if (s?.value) setSessionId(JSON.parse(s.value));
    } catch (e) { setDb(seedDB()); }
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded && db) { try { window.storage.set("krisha:db", JSON.stringify(db)); } catch (e) {} } }, [db, loaded]);
  useEffect(() => { if (loaded) { try { window.storage.set("krisha:session", JSON.stringify(sessionId)); } catch (e) {} } }, [sessionId, loaded]);

  if (!db) return null;
  const user = db.users.find((u) => u.id === sessionId) || null;
  const patch = (fn) => setDb((d) => fn(structuredClone(d)));

  return (
    <div style={{ ...F, background: C.bg, color: C.ink, minHeight: "100vh" }}>
      <style>{FONTS}</style>
      {user
        ? <Shell db={db} user={user} patch={patch} onLogout={() => setSessionId(null)} />
        : <LoginPage db={db} patch={patch} onLogin={setSessionId} />}
    </div>
  );
}

/* ---- Каркас: верхняя панель + маршрутизация по ролям ------------- */
function Shell({ db, user, patch, onLogout, onLogin }) {
  const roleTabs = {
    super: [["companies", "Застройщики"], ["banks", "Банки"], ["orders", "Заявки"], ["dashboard", "Дашборд"], ["requests", "Заявки застройщиков"], ["catalog", "Каталог"]],
    dev_admin: [["orders", "Заявки"], ["dashboard", "Дашборд"], ["complexes", "ЖК"], ["stock", "Сток"], ["staff", "Сотрудники"], ["site", "Сайт"], ["catalog", "Каталог"]],
    manager: [["desk", "Рабочий стол"], ["orders", "Заявки"], ["catalog", "Каталог"]],
    client: [["catalog", "Каталог"], ["orders", "Мои заявки"], ["apply", "Стать застройщиком"]],
  };
  let tabs = roleTabs[user.role] || roleTabs.client;
  const company = user.companyId ? db.companies.find((c) => c.id === user.companyId) : null;
  if (user.role === "dev_admin" && company?.canCreateCompanies) tabs = [...tabs, ["companies", "Застройщики"]];

  const [tab, setTab] = useState(tabs[0][0]);
  useEffect(() => { setTab(tabs[0][0]); }, [user.id]);

  return (
    <>
      <nav style={{ background: C.sidebar, color: "#dfe3ea", padding: "0 clamp(14px,4vw,40px)", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: ".5px" }}>krish<span style={{ color: C.gold }}>-a</span></div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", ...F, fontSize: 13.5, fontWeight: 600, background: tab === k ? C.brand : "transparent", color: tab === k ? "#06131C" : "#aab1bd" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ color: "#aab1bd" }}>{user.fullName} · {roleName(user.role)}{company ? " · " + company.name : ""}</span>
          <button onClick={onLogout} style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "none", padding: "7px 12px", borderRadius: 8, cursor: "pointer", ...F, fontSize: 13 }}>Выйти</button>
        </div>
      </nav>

      {tab === "catalog" && <Catalog db={db} user={user} patch={patch} />}
      {tab === "companies" && <Companies db={db} user={user} patch={patch} />}
      {tab === "complexes" && <DevComplexes db={db} user={user} patch={patch} />}
      {tab === "stock" && <Stock db={db} user={user} patch={patch} />}
      {tab === "staff" && <Staff db={db} user={user} patch={patch} />}
      {tab === "orders" && <Orders db={db} user={user} patch={patch} />}
      {tab === "dashboard" && <Dashboard db={db} user={user} />}
      {tab === "site" && <SiteSettings db={db} user={user} patch={patch} />}
      {tab === "desk" && <ManagerDesk db={db} user={user} patch={patch} />}
      {tab === "banks" && <BanksAdmin db={db} patch={patch} />}
      {tab === "apply" && <ApplyView db={db} patch={patch} />}
      {tab === "requests" && <Requests db={db} patch={patch} />}
    </>
  );
}
const roleName = (r) => ({ super: "Главный админ", dev_admin: "Админ застройщика", manager: "Менеджер", client: "Клиент" }[r] || r);

/* ---- Логин ------------------------------------------------------- */
function LoginButton({ db, onLogin, patch }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button onClick={() => setOpen(true)} style={{ background: C.brand, color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", ...F, fontSize: 13.5, fontWeight: 600 }}>Войти</button>
    {open && <LoginModal db={db} onLogin={(id) => { onLogin(id); setOpen(false); }} patch={patch} onClose={() => setOpen(false)} />}
  </>);
}
function LoginModal({ db, onLogin, patch, onClose }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [err, setErr] = useState("");
  const [rn, setRn] = useState(""); const [rp, setRp] = useState("");
  const login = () => { const u = db.users.find((x) => x.email === email.trim() && x.password === pass); if (u) onLogin(u.id); else setErr("Неверный email или пароль"); };
  const register = () => {
    if (!rn.trim() || !validPhone(rp)) { setErr("Заполните имя и телефон"); return; }
    const id = uid("u"); patch((d) => { d.users.push({ id, role: "client", companyId: null, fullName: rn.trim(), email: "", phone: phoneD(rp), password: "" }); return d; }); onLogin(id);
  };
  const demos = db.users.filter((u) => ["u-super","u-h-adm","u-h-mgr","u-bi-adm","u-client"].includes(u.id));
  return (
    <Modal onClose={onClose} w={440} title="Вход в krish-a">
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["login","Вход"],["reg","Регистрация клиента"]].map(([k,l]) => <button key={k} onClick={() => { setMode(k); setErr(""); }} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${mode===k?C.brand:C.line}`, background: mode===k?C.brandSoft:"#fff", color: mode===k?C.brandDk:C.sub, cursor: "pointer", ...F, fontSize: 13.5, fontWeight: 600 }}>{l}</button>)}
      </div>
      {mode === "login" ? (<>
        <Fld l="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@krish-a.kz" style={inp} /></Fld>
        <Fld l="Пароль"><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key==="Enter" && login()} style={inp} /></Fld>
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <BtnP onClick={login}>Войти</BtnP>
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>Демо-вход одним кликом:</div>
          <div style={{ display: "grid", gap: 6 }}>
            {demos.map((u) => <button key={u.id} onClick={() => onLogin(u.id)} style={{ textAlign: "left", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.panel2, cursor: "pointer", ...F, fontSize: 13 }}>{roleName(u.role)} — {u.fullName}{u.email?` · ${u.email}`:""}</button>)}
          </div>
        </div>
      </>) : (<>
        <Fld l="Имя"><input value={rn} onChange={(e) => setRn(e.target.value)} placeholder="Ваше имя" style={inp} /></Fld>
        <Fld l="Телефон"><input value={fmtPhone(rp)} onChange={(e) => setRp(phoneD(e.target.value))} placeholder="+7 (7__) ___-__-__" style={{ ...inp, ...mono }} /></Fld>
        {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <BtnP onClick={register}>Зарегистрироваться и войти</BtnP>
      </>)}
    </Modal>
  );
}

/* ---- Каталог ЖК (общедоступный маркетплейс) --------------------- */
function Catalog({ db, user, patch }) {
  const [city, setCity] = useState("all"); const [cls, setCls] = useState("all"); const [q, setQ] = useState("");
  const [openCx, setOpenCx] = useState(null);
  const visible = db.complexes.filter((cx) => {
    if (user?.role === "super") return true;
    if ((user?.role === "dev_admin" || user?.role === "manager") && cx.companyId === user.companyId) return true;
    return cx.isPublic; // клиент/гость — только опубликованные
  });
  const list = visible.filter((cx) => (city==="all"||cx.city===city) && (cls==="all"||cx.class===cls) && (!q || cx.name.toLowerCase().includes(q.toLowerCase())));
  const cur = db.complexes.find((c) => c.id === openCx);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px clamp(14px,4vw,40px)" }}>
      <h1 style={{ ...F, fontWeight: 700, fontSize: 26, margin: "0 0 4px" }}>Новостройки Казахстана</h1>
      <div style={{ fontSize: 13.5, color: C.sub, marginBottom: 18 }}>{list.length} ЖК{user && user.role!=="client" ? " · включая непубличные вашей компании" : ""}</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск ЖК…" style={{ ...inp, maxWidth: 240 }} />
        <select value={city} onChange={(e) => setCity(e.target.value)} style={{ ...inp, maxWidth: 180 }}><option value="all">Все города</option>{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={cls} onChange={(e) => setCls(e.target.value)} style={{ ...inp, maxWidth: 180 }}><option value="all">Все классы</option>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
        {list.map((cx) => { const co = db.companies.find((c)=>c.id===cx.companyId); const apts = db.apartments.filter((a)=>a.complexId===cx.id); return (
          <div key={cx.id} onClick={() => setOpenCx(cx.id)} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer" }}>
            <Cover cx={cx} h={150} />
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{cx.name}</div>
                {!cx.isPublic && <span style={{ fontSize: 10.5, background: "#f0e7d6", color: C.gold, padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>непубличный</span>}
              </div>
              <div style={{ fontSize: 13, color: C.sub, margin: "4px 0 10px" }}>{cx.city}, {cx.district} · {co?.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 11, color: C.sub }}>от</div><div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(cx.priceFrom/1e6)} млн ₸</div></div>
                <div style={{ fontSize: 12.5, color: C.sub }}>{apts.length} квартир · {cx.class}</div>
              </div>
            </div>
          </div>
        ); })}
        {list.length === 0 && <div style={{ color: C.sub, gridColumn: "1/-1", padding: 24 }}>Ничего не найдено.</div>}
      </div>
      {cur && <ComplexDetail db={db} user={user} patch={patch} cx={cur} onClose={() => setOpenCx(null)} />}
    </div>
  );
}
function Cover({ cx, h }) {
  if (cx.cover) return <div style={{ height: h, backgroundImage: `url(${cx.cover})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
  return <div style={{ height: h, background: `linear-gradient(150deg,hsl(${cx.hue||210} 30% 42%),hsl(${cx.hue||210} 34% 22%))`, display: "flex", alignItems: "flex-end", padding: 14 }}><div style={{ ...F, fontWeight: 700, fontSize: 22, color: "#fff" }}>{cx.name}</div></div>;
}

/* ---- Детали ЖК + квартиры + оформление -------------------------- */
function ComplexDetail({ db, user, patch, cx, onClose }) {
  const co = db.companies.find((c) => c.id === cx.companyId);
  const apts = db.apartments.filter((a) => a.complexId === cx.id);
  const [flow, setFlow] = useState(null);
  const canOrder = user && (user.role === "client" || (user.role === "manager" && (user.complexes||[]).includes(cx.id)) || user.role === "dev_admin" || user.role === "super");
  const orderLabel = user?.role === "manager" || user?.role === "dev_admin" ? "Отправить заявку в банк" : "Оформить ипотеку";
  return (
    <Modal onClose={onClose} w={760} title={cx.name} sub={`${cx.city}, ${cx.address} · ${co?.name} · ${cx.class}`}>
      <Cover cx={cx} h={180} />
      <div style={{ display: "flex", gap: 20, margin: "14px 0", flexWrap: "wrap", fontSize: 13.5 }}>
        <span><b>Сдача:</b> {cx.deadline}</span><span><b>От:</b> {fmt(cx.priceFrom/1e6)} млн ₸</span><span><b>Квартир:</b> {apts.length}</span>
      </div>
      <div style={{ ...F, fontWeight: 700, fontSize: 15, margin: "8px 0 8px" }}>Квартиры</div>
      {apts.length === 0 ? <div style={{ color: C.sub, fontSize: 13.5 }}>Сток не загружен.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}><thead><tr>{["Блок","Этаж","Комнат","Площадь","Цена","Статус",""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{apts.map((a) => (<tr key={a.id}>
              <td style={td}>{a.block}</td><td style={td}>{a.floor}</td><td style={td}>{a.rooms}</td><td style={td}>{a.area} м²</td>
              <td style={{ ...td, fontWeight: 600 }}>{fmt(a.price)} ₸</td>
              <td style={td}><Badge s={a.status} /></td>
              <td style={td}>{canOrder && a.status==="free" && <button onClick={() => setFlow(a)} style={miniBtn}>Заявка →</button>}</td>
            </tr>))}</tbody>
          </table>
        </div>
      )}
      {!canOrder && !user && <div style={{ marginTop: 14, background: C.brandSoft, color: C.brandDk, borderRadius: 10, padding: "12px 14px", fontSize: 13.5 }}>Войдите как клиент, чтобы оформить ипотеку онлайн.</div>}
      {flow && <BrokerFlow db={db} patch={patch} user={user} cx={cx} apt={flow} onClose={() => setFlow(null)} onDone={onClose} />}
    </Modal>
  );
}
function Badge({ s }) { const m = { free: ["Свободна", C.green, C.greenSoft], booked: ["Бронь", C.amber, "#2A2413"], sold: ["Продана", C.sub, "#1A2230"] }[s] || ["—", C.sub, "#1A2230"]; return <span style={{ fontSize: 11.5, fontWeight: 600, color: m[1], background: m[2], padding: "3px 9px", borderRadius: 12 }}>{m[0]}</span>; }

/* ---- Брокерский флоу (ипотека/рассрочка) ------------------------ */
function BrokerFlow({ db, patch, user, cx, apt, onClose, onDone }) {
  const STEPS = ["Заявка", "Согласие", "Решение банка", "Оформление"];
  const [step, setStep] = useState(0);
  const priceT = apt.price;
  const [downPct, setDownPct] = useState(30); const [months, setMonths] = useState(180);
  const [name, setName] = useState(user?.role==="client" ? user.fullName : "");
  const [iin, setIin] = useState(""); const [phone, setPhone] = useState(user?.role==="client" ? user.phone : "");
  const [cons, setCons] = useState(false); const [busy, setBusy] = useState(false);
  const [dec, setDec] = useState(null); const [chosen, setChosen] = useState(null); const [ref, setRef] = useState(null);
  const downT = Math.round(priceT * downPct / 100);
  const offers = useMemo(() => offersForCompany(db.connectors, cx.companyId, priceT, downT, months), [db, cx, priceT, downT, months]);
  const iinOk = validateIin(iin), phoneOk = validPhone(phone);

  const send = async () => { setBusy(true); await wait(1200); setDec(offers.length ? "approved" : "rejected"); setStep(2); setBusy(false); };
  const pick = async (o) => { setBusy(true); await wait(500); setChosen(o); setStep(3); setBusy(false); };
  const finish = async () => {
    setBusy(true); await wait(700);
    const r = "AP-" + Math.floor(100000 + Math.random()*899999);
    patch((d) => {
      d.applications.unshift({ id: uid("app"), ref: r, orderId: "ORD-" + Math.floor(100000+Math.random()*899999), companyId: cx.companyId, complexId: cx.id, apartmentId: apt.id, createdBy: user?.id || null, clientName: name, clientIin: iin, clientPhone: phone, price: priceT, down: downT, months, product: chosen, state: "issued", created: nowD() });
      const a = d.apartments.find((x) => x.id === apt.id); if (a) a.status = "sold";
      return d;
    });
    setRef(r); setStep(4); setBusy(false);
  };

  return (
    <Modal onClose={onClose} w={560} title={`${cx.name} · ${apt.rooms}-комн. ${apt.area} м²`} sub={`${fmt(priceT)} ₸`}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {STEPS.map((s, i) => <div key={s} style={{ flex: 1, fontSize: 11, textAlign: "center" }}><div style={{ height: 4, borderRadius: 3, background: i<=step?C.brand:C.line, marginBottom: 5 }} /><span style={{ color: i<=step?C.ink:C.sub }}>{i+1}. {s}</span></div>)}
      </div>
      {step === 0 && (<>
        <Slider l="Первоначальный взнос" v={`${downPct}% · ${fmt(downT/1e6)} млн ₸`} min={10} max={60} val={downPct} on={setDownPct} />
        <Slider l="Срок" v={`${months} мес · ${Math.round(months/12)} лет`} min={12} max={300} val={months} on={setMonths} />
        <div style={box}>Сумма займа <b style={mono}>{fmt(priceT-downT)} ₸</b> · банков-партнёров: <b>{new Set(offers.map(o=>o.bank)).size}</b></div>
        <Fld l="Имя клиента"><input value={name} onChange={(e)=>setName(e.target.value)} style={inp} placeholder="ФИО" /></Fld>
        <Fld l="ИИН"><div style={{ position:"relative" }}><input value={iin} maxLength={12} onChange={(e)=>setIin(e.target.value.replace(/\D/g,""))} placeholder="12 цифр" style={{ ...inp, ...mono, borderColor: iin.length===12?(iinOk?C.green:C.red):C.line }} /><Tick show={iin.length===12} ok={iinOk} /></div></Fld>
        <Fld l="Телефон"><input value={fmtPhone(phone)} onChange={(e)=>setPhone(phoneD(e.target.value))} placeholder="+7 (7__) ___-__-__" style={{ ...inp, ...mono }} /></Fld>
        <BtnP disabled={!(name.trim()&&iinOk&&phoneOk)} onClick={()=>setStep(1)}>Далее →</BtnP>
      </>)}
      {step === 1 && (<>
        <p style={{ fontSize: 13.5, color: C.sub }}>Банк запрашивает кредитную историю (ПКБ/ГЦВП) и доходы. Требуется согласие клиента.</p>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, margin: "10px 0 16px", cursor: "pointer", lineHeight: 1.45 }}><input type="checkbox" checked={cons} onChange={(e)=>setCons(e.target.checked)} style={{ accentColor: C.brand, width: 17, height: 17, marginTop: 1 }} />Согласие на запрос в ПКБ/ГЦВП и обработку персональных данных</label>
        <div style={{ display: "flex", gap: 10 }}><BtnG onClick={()=>setStep(0)}>Назад</BtnG><BtnP disabled={!cons||busy} onClick={send}>{busy?"Отправка…":"Отправить в банк →"}</BtnP></div>
      </>)}
      {step === 2 && (dec==="rejected" ? (
        <div style={{ textAlign:"center", padding:20 }}><div style={{ ...F, fontWeight:700, fontSize:20, color:C.red }}>Отказ / нет активных банков</div><p style={{ fontSize:13.5, color:C.sub }}>У компании нет включённых банковских продуктов. Настройте интеграцию (Компании → Банки).</p><BtnG onClick={onClose}>Закрыть</BtnG></div>
      ) : (<>
        <div style={{ ...F, fontWeight:700, fontSize:16, marginBottom:10 }}>Одобрено · выберите предложение</div>
        <div style={{ display:"grid", gap:10 }}>{offers.map((o) => (
          <div key={o.id} style={{ border:`1px solid ${C.line}`, borderRadius:12, padding:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}><div><b>{o.bank}</b><div style={{ fontSize:12.5, color:C.sub }}>{o.name}</div></div><span style={{ ...mono, fontWeight:700, color:C.brandDk }}>{o.rate===0?"0%":o.rate+"%"}</span></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}><Metr l="Займ" v={`${fmt(o.loan)} ₸`} /><Metr l={o.kind==="installment"?"Срок":"ГЭСВ"} v={o.kind==="installment"?`${o.term} мес`:`от ${o.gesv}%`} /><Metr l="Платёж" v={`${fmt(o.monthly)} ₸`} /></div>
            <BtnP disabled={busy} onClick={()=>pick(o)}>Выбрать</BtnP>
          </div>
        ))}</div>
      </>))}
      {step === 3 && (<>
        <div style={{ ...F, fontWeight:700, fontSize:16, marginBottom:6 }}>Оформление ДДУ</div>
        <p style={{ fontSize:13.5, color:C.sub }}>{chosen.bank} · {chosen.name} · {fmt(chosen.loan)} ₸ · {fmt(chosen.monthly)} ₸/мес</p>
        <div style={{ background:C.brandSoft, color:C.brandDk, borderRadius:10, padding:"12px 14px", margin:"12px 0", fontSize:12.5, lineHeight:1.5 }}>Регистрация ДДУ → оплата взноса → гарантийное письмо → передача пакета в банк → выдача займа застройщику.</div>
        <BtnP disabled={busy} onClick={finish}>{busy?"Оформляем…":"Оформить →"}</BtnP>
      </>)}
      {step === 4 && (
        <div style={{ textAlign:"center", padding:10 }}><div style={{ ...F, fontWeight:700, fontSize:22, color:C.green, marginBottom:8 }}>Заявка оформлена ✓</div><div style={{ fontSize:14, color:C.sub, marginBottom:16 }}>Заявка <b style={{ ...mono, color:C.ink }}>{ref}</b> в разделе «Заявки». Квартира отмечена проданной.</div><BtnP onClick={()=>{ onClose(); onDone&&onDone(); }}>Готово</BtnP></div>
      )}
    </Modal>
  );
}

/* ---- Мои ЖК (dev_admin / manager) ------------------------------- */
function DevComplexes({ db, user, patch }) {
  const [edit, setEdit] = useState(null);
  const mine = db.complexes.filter((c) => c.companyId === user.companyId);
  const isMgr = user.role === "manager";
  const fileRef = useRef(); const [msg, setMsg] = useState("");
  const template = () => { const a = document.createElement("a"); a.href = "/template-zastroishik.xlsx"; a.download = "template-zastroishik.xlsx"; document.body.appendChild(a); a.click(); a.remove(); };
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const jkSheet = wb.Sheets["ЖК"] || wb.Sheets[wb.SheetNames[0]];
      const jkRows = XLSX.utils.sheet_to_json(jkSheet, { defval: "" });
      const map = {};
      patch((d) => {
        jkRows.forEach((r) => {
          const name = String(r["Название ЖК"] || r.name || "").trim(); if (!name) return;
          const id = uid("cx"); map[name] = id;
          d.complexes.push({ id, companyId: user.companyId, name, class: String(r["Класс"] || "Комфорт"), city: String(r["Город"] || "Алматы"), district: String(r["Район"] || ""), address: String(r["Адрес"] || ""), deadline: String(r["Срок сдачи"] || ""), priceFrom: +(r["Цена от (₸)"] || 0) || 0, cover: String(r["Обложка (URL)"] || ""), isPublic: /да|yes|true|1/i.test(String(r["Публичный (да/нет)"] || "")), hue: Math.floor(Math.random() * 360) });
        });
        const aptSheet = wb.Sheets["Квартиры"];
        if (aptSheet) XLSX.utils.sheet_to_json(aptSheet, { defval: "" }).forEach((r) => {
          const jk = String(r["ЖК (название)"] || "").trim();
          const cxId = map[jk] || (d.complexes.find((c) => c.companyId === user.companyId && c.name === jk) || {}).id;
          if (!cxId) return;
          d.apartments.push({ id: uid("apt"), complexId: cxId, block: String(r["Блок"] || ""), floor: +(r["Этаж"] || 0) || 0, rooms: +(r["Комнат"] || 0) || 0, area: +(r["Площадь (м²)"] || 0) || 0, price: +(r["Цена (₸)"] || 0) || 0, status: String(r["Статус (free/booked/sold)"] || "free") || "free", image: String(r["Планировка (URL)"] || "") });
        });
        return d;
      });
      setMsg("Импортировано ЖК: " + jkRows.filter((r) => String(r["Название ЖК"] || "").trim()).length);
    } catch (err) { setMsg("Не удалось прочитать файл. Используйте шаблон застройщика."); }
    e.target.value = "";
  };
  const del = (id) => patch((d) => { d.complexes = d.complexes.filter((c)=>c.id!==id); d.apartments = d.apartments.filter((a)=>a.complexId!==id); return d; });
  const togglePublic = (id, v) => patch((d) => { const c = d.complexes.find((x)=>x.id===id); if(c) c.isPublic=v; return d; });
  return (
    <Pad title={isMgr?"ЖК компании":"Мои ЖК"} sub={isMgr?"Публикацией и стоком управляет админ застройщика":"Публичные ЖК видят клиенты; непубличные — только сотрудники компании"}>
      {!isMgr && <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:16 }}>
        <BtnP style={{ width:"auto" }} onClick={()=>setEdit({ companyId:user.companyId, city:"Алматы", class:"Комфорт", isPublic:false, hue:210 })}>+ Добавить ЖК</BtnP>
        <BtnG onClick={()=>fileRef.current.click()}>Импорт ЖК+сток (Excel)</BtnG>
        <button onClick={template} style={{ ...miniBtn, padding:"10px 14px" }}>Шаблон застройщика</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display:"none" }} />
        {msg && <span style={{ fontSize:13, color:C.green }}>{msg}</span>}
      </div>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
        {mine.map((cx) => { const apts = db.apartments.filter((a)=>a.complexId===cx.id); return (
          <div key={cx.id} style={{ background:C.panel, border:`1px solid ${C.line}`, borderRadius:14, overflow:"hidden" }}>
            <Cover cx={cx} h={120} />
            <div style={{ padding:14 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>{cx.name}</div>
              <div style={{ fontSize:12.5, color:C.sub, margin:"3px 0 10px" }}>{cx.city} · {cx.class} · {apts.length} квартир</div>
              <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginBottom:10, cursor: isMgr?"default":"pointer" }}>
                <input type="checkbox" disabled={isMgr} checked={cx.isPublic} onChange={(e)=>togglePublic(cx.id, e.target.checked)} style={{ accentColor:C.brand, width:16, height:16 }} />
                Виден клиентам (публичный)
              </label>
              {!isMgr && <div style={{ display:"flex", gap:8 }}><button onClick={()=>setEdit(cx)} style={miniBtn}>Изменить</button><button onClick={()=>del(cx.id)} style={{ ...miniBtn, color:C.red, borderColor:"#f0d0cc" }}>Удалить</button></div>}
            </div>
          </div>
        ); })}
        {mine.length===0 && <div style={{ color:C.sub }}>ЖК пока нет.</div>}
      </div>
      {edit && <ComplexForm cx={edit} onClose={()=>setEdit(null)} onSave={(data)=>{ patch((d)=>{ if(data.id){ const i=d.complexes.findIndex((x)=>x.id===data.id); d.complexes[i]=data; } else { d.complexes.push({ ...data, id:uid("cx") }); } return d; }); setEdit(null); }} />}
    </Pad>
  );
}
function ComplexForm({ cx, onClose, onSave }) {
  const [f, setF] = useState({ hue:210, ...cx });
  const set = (k,v) => setF((s)=>({ ...s, [k]:v }));
  return (
    <Modal onClose={onClose} w={520} title={cx.id?"Изменить ЖК":"Новый ЖК"}>
      <Grid>
        <Fld l="Название"><input value={f.name||""} onChange={(e)=>set("name",e.target.value)} style={inp} /></Fld>
        <Fld l="Класс"><select value={f.class} onChange={(e)=>set("class",e.target.value)} style={inp}>{CLASSES.map((c)=><option key={c}>{c}</option>)}</select></Fld>
        <Fld l="Город"><select value={f.city} onChange={(e)=>set("city",e.target.value)} style={inp}>{CITIES.map((c)=><option key={c}>{c}</option>)}</select></Fld>
        <Fld l="Район"><input value={f.district||""} onChange={(e)=>set("district",e.target.value)} style={inp} /></Fld>
        <Fld l="Адрес" wide><input value={f.address||""} onChange={(e)=>set("address",e.target.value)} style={inp} /></Fld>
        <Fld l="Срок сдачи"><input value={f.deadline||""} onChange={(e)=>set("deadline",e.target.value)} placeholder="II кв. 2025" style={inp} /></Fld>
        <Fld l="Цена от, ₸"><input value={f.priceFrom||""} onChange={(e)=>set("priceFrom",+e.target.value||0)} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="Обложка (URL картинки)" wide><input value={f.cover||""} onChange={(e)=>set("cover",e.target.value)} placeholder="https://…/cover.jpg" style={{ ...inp, ...mono }} /></Fld>
      </Grid>
      <label style={{ display:"flex", gap:10, alignItems:"center", fontSize:13.5, margin:"6px 0 14px", cursor:"pointer" }}><input type="checkbox" checked={!!f.isPublic} onChange={(e)=>set("isPublic",e.target.checked)} style={{ accentColor:C.brand, width:17, height:17 }} />Опубликовать (виден клиентам в каталоге)</label>
      <BtnP disabled={!f.name} onClick={()=>onSave(f)}>Сохранить</BtnP>
    </Modal>
  );
}

/* ---- Сток квартир: ручной ввод + импорт Excel ------------------- */
function Stock({ db, user, patch }) {
  const mine = db.complexes.filter((c) => c.companyId === user.companyId);
  const [cxId, setCxId] = useState(mine[0]?.id || "");
  const apts = db.apartments.filter((a) => a.complexId === cxId);
  const fileRef = useRef();
  const [msg, setMsg] = useState("");

  const addRow = () => patch((d)=>{ d.apartments.push({ id:uid("apt"), complexId:cxId, block:"", floor:1, rooms:1, area:0, price:0, status:"free", image:"" }); return d; });
  const setRow = (id,k,v) => patch((d)=>{ const a=d.apartments.find((x)=>x.id===id); if(a) a[k]=v; return d; });
  const delRow = (id) => patch((d)=>{ d.apartments=d.apartments.filter((x)=>x.id!==id); return d; });

  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Блок","Этаж","Комнат","Площадь","Цена","Статус","Картинка"], ["1", 5, 2, 62.5, 28000000, "free", ""]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Сток");
    XLSX.writeFile(wb, "template-stock.xlsx");
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const mapped = rows.map((r) => ({
        id: uid("apt"), complexId: cxId,
        block: String(r["Блок"] ?? r.block ?? ""), floor: +(r["Этаж"] ?? r.floor ?? 0) || 0,
        rooms: +(r["Комнат"] ?? r.rooms ?? 0) || 0, area: +(r["Площадь"] ?? r.area ?? 0) || 0,
        price: +(r["Цена"] ?? r.price ?? 0) || 0, status: String(r["Статус"] ?? r.status ?? "free") || "free",
        image: String(r["Картинка"] ?? r.image ?? ""),
      })).filter((a) => a.rooms || a.area || a.price);
      patch((d) => { d.apartments.push(...mapped); return d; });
      setMsg(`Импортировано квартир: ${mapped.length}`);
    } catch (err) { setMsg("Не удалось прочитать файл. Проверьте формат."); }
    e.target.value = "";
  };

  return (
    <Pad title="Сток квартир" sub="Добавляйте вручную или импортом Excel: колонки Блок · Этаж · Комнат · Площадь · Цена · Статус · Картинка(URL)">
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:16 }}>
        <select value={cxId} onChange={(e)=>setCxId(e.target.value)} style={{ ...inp, maxWidth:280 }}>{mine.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <BtnP style={{ width:"auto" }} onClick={addRow}>+ Квартира</BtnP>
        <BtnG onClick={()=>fileRef.current.click()}>Импорт Excel</BtnG>
        <button onClick={template} style={{ ...miniBtn, padding:"10px 14px" }}>Скачать шаблон</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display:"none" }} />
        {msg && <span style={{ fontSize:13, color:C.green }}>{msg}</span>}
      </div>
      {!cxId ? <div style={{ color:C.sub }}>Сначала создайте ЖК во вкладке «Мои ЖК».</div> : (
        <div style={{ overflowX:"auto", background:C.panel, border:`1px solid ${C.line}`, borderRadius:12 }}>
          <table style={{ ...tbl, minWidth:720 }}><thead><tr>{["Блок","Этаж","Комнат","Площадь","Цена, ₸","Статус","Картинка (URL)",""].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{apts.map((a)=>(<tr key={a.id}>
              <td style={td}><input value={a.block} onChange={(e)=>setRow(a.id,"block",e.target.value)} style={{ ...inp, width:60 }} /></td>
              <td style={td}><input value={a.floor} onChange={(e)=>setRow(a.id,"floor",+e.target.value||0)} style={{ ...inp, ...mono, width:56 }} /></td>
              <td style={td}><input value={a.rooms} onChange={(e)=>setRow(a.id,"rooms",+e.target.value||0)} style={{ ...inp, ...mono, width:56 }} /></td>
              <td style={td}><input value={a.area} onChange={(e)=>setRow(a.id,"area",+e.target.value||0)} style={{ ...inp, ...mono, width:72 }} /></td>
              <td style={td}><input value={a.price} onChange={(e)=>setRow(a.id,"price",+e.target.value||0)} style={{ ...inp, ...mono, width:120 }} /></td>
              <td style={td}><select value={a.status} onChange={(e)=>setRow(a.id,"status",e.target.value)} style={{ ...inp, width:110 }}><option value="free">Свободна</option><option value="booked">Бронь</option><option value="sold">Продана</option></select></td>
              <td style={td}><input value={a.image} onChange={(e)=>setRow(a.id,"image",e.target.value)} placeholder="https://…" style={{ ...inp, ...mono, minWidth:160 }} /></td>
              <td style={td}><button onClick={()=>delRow(a.id)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button></td>
            </tr>))}
            {apts.length===0 && <tr><td colSpan={8} style={{ ...td, textAlign:"center", color:C.sub }}>Квартир нет. Добавьте вручную или импортом.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Pad>
  );
}

/* ---- Сотрудники (dev_admin заводит менеджеров) ------------------ */
function Staff({ db, user, patch }) {
  const managers = db.users.filter((u) => u.companyId === user.companyId && u.role === "manager");
  const mine = db.complexes.filter((c) => c.companyId === user.companyId);
  const [add, setAdd] = useState(null);
  const del = (id) => patch((d) => { d.users = d.users.filter((u)=>u.id!==id); return d; });
  const toggleCx = (uid_, cxId) => patch((d) => { const u=d.users.find((x)=>x.id===uid_); u.complexes=u.complexes||[]; u.complexes = u.complexes.includes(cxId)?u.complexes.filter((c)=>c!==cxId):[...u.complexes,cxId]; return d; });
  return (
    <Pad title="Сотрудники" sub="Менеджеры авторизуются в приложении и отправляют заявки в банк по прикреплённым ЖК">
      <BtnP style={{ width:"auto", marginBottom:16 }} onClick={()=>setAdd({ fullName:"", email:"", phone:"", password:"" })}>+ Менеджер</BtnP>
      <div style={{ display:"grid", gap:12 }}>
        {managers.map((m) => (
          <div key={m.id} style={{ background:C.panel, border:`1px solid ${C.line}`, borderRadius:12, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start" }}>
              <div><div style={{ fontWeight:700 }}>{m.fullName}</div><div style={{ fontSize:12.5, color:C.sub, ...mono }}>{m.email||"—"} · {fmtPhone(m.phone)}</div></div>
              <button onClick={()=>del(m.id)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>Удалить</button>
            </div>
            <div style={{ fontSize:12.5, color:C.sub, margin:"10px 0 6px" }}>Доступ к ЖК (отправка заявок):</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {mine.map((cx) => { const on = (m.complexes||[]).includes(cx.id); return (
                <button key={cx.id} onClick={()=>toggleCx(m.id, cx.id)} style={{ padding:"5px 11px", borderRadius:16, border:`1px solid ${on?C.brand:C.line}`, background:on?C.brandSoft:"#fff", color:on?C.brandDk:C.sub, cursor:"pointer", ...F, fontSize:12.5 }}>{cx.name}{on?" ✓":""}</button>
              ); })}
              {mine.length===0 && <span style={{ fontSize:12.5, color:C.sub }}>Сначала создайте ЖК.</span>}
            </div>
          </div>
        ))}
        {managers.length===0 && <div style={{ color:C.sub }}>Менеджеров нет.</div>}
      </div>
      {add && <Modal onClose={()=>setAdd(null)} w={440} title="Новый менеджер">
        <Fld l="ФИО"><input value={add.fullName} onChange={(e)=>setAdd({ ...add, fullName:e.target.value })} style={inp} /></Fld>
        <Fld l="Email (логин)"><input value={add.email} onChange={(e)=>setAdd({ ...add, email:e.target.value })} style={inp} /></Fld>
        <Fld l="Телефон"><input value={fmtPhone(add.phone)} onChange={(e)=>setAdd({ ...add, phone:phoneD(e.target.value) })} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="Пароль"><input value={add.password} onChange={(e)=>setAdd({ ...add, password:e.target.value })} style={inp} /></Fld>
        <BtnP disabled={!add.fullName||!add.email} onClick={()=>{ patch((d)=>{ d.users.push({ id:uid("u"), role:"manager", companyId:user.companyId, fullName:add.fullName, email:add.email, phone:phoneD(add.phone), password:add.password||"1234", complexes:[] }); return d; }); setAdd(null); }}>Создать</BtnP>
      </Modal>}
    </Pad>
  );
}

/* ---- Компании (super; либо dev_admin с делегированием) ---------- */
function Companies({ db, user, patch }) {
  const isSuper = user.role === "super";
  const [add, setAdd] = useState(null);
  const [cfg, setCfg] = useState(null); // companyId для настройки банков
  const [reqCo, setReqCo] = useState(null); const [docEd, setDocEd] = useState(false);
  const list = isSuper ? db.companies : db.companies.filter((c)=>c.id===user.companyId);
  const toggleDelegate = (id, v) => patch((d)=>{ const c=d.companies.find((x)=>x.id===id); if(c) c.canCreateCompanies=v; return d; });
  return (
    <Pad title="Строительные компании" sub={isSuper?"Заведение компаний, делегирование и настройка банковской интеграции":"Вам делегировано право заводить компании"}>
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <BtnP style={{ width:"auto" }} onClick={()=>setAdd({ name:"", bin:"", city:"Алматы", admName:"", admEmail:"", admPass:"" })}>+ Компания</BtnP>
        {isSuper && <BtnG onClick={()=>setDocEd(true)}>Шаблон документа</BtnG>}
      </div>
      <div style={{ display:"grid", gap:12 }}>
        {list.map((co) => { const conns = db.connectors.filter((k)=>k.companyId===co.id); const staff = db.users.filter((u)=>u.companyId===co.id); const cxs = db.complexes.filter((c)=>c.companyId===co.id); return (
          <div key={co.id} style={{ background:C.panel, border:`1px solid ${C.line}`, borderRadius:12, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:16 }}>{co.name}</div>
                <div style={{ fontSize:12.5, color:C.sub, ...mono }}>БИН {co.bin||"—"} · {co.city} · {cxs.length} ЖК · {staff.length} польз. · {conns.filter((k)=>k.enabled).length}/{conns.length} банков</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {isSuper && <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12.5, cursor:"pointer" }}><input type="checkbox" checked={!!co.canCreateCompanies} onChange={(e)=>toggleDelegate(co.id, e.target.checked)} style={{ accentColor:C.indigo, width:15, height:15 }} />может заводить компании</label>}
                {isSuper && <button onClick={()=>setReqCo(co)} style={miniBtn}>Реквизиты</button>}
                {isSuper && <button onClick={()=>setCfg(co.id)} style={{ ...miniBtn, borderColor:C.indigo, color:C.indigo }}>Банки и продукты</button>}
              </div>
            </div>
          </div>
        ); })}
      </div>
      {add && <CompanyForm add={add} onClose={()=>setAdd(null)} onSave={(data)=>{ patch((d)=>{
        const cid = uid("co"); d.companies.push({ id:cid, name:data.name, bin:data.bin, city:data.city, canCreateCompanies:false, createdBy:user.id, requisites:{ name:data.name, bin:data.bin, address:"", director:"", phone:"", iik:"", bank:"" }, site:{ enabled:false, domain:"" } });
        d.users.push({ id:uid("u"), role:"dev_admin", companyId:cid, fullName:data.admName, email:data.admEmail, phone:"", password:data.admPass||"1234" });
        const k = altynConnector(cid); k.seller={ name:data.name, bin:data.bin, branchCode:"", managerPhone:"" }; k.enabled=false; d.connectors.push(k);
        return d; }); setAdd(null); }} />}
      {cfg && <CompanyBanks db={db} patch={patch} companyId={cfg} onClose={()=>setCfg(null)} />}
      {reqCo && <RequisitesForm co={reqCo} patch={patch} onClose={()=>setReqCo(null)} />}
      {docEd && <DocTemplateForm db={db} patch={patch} onClose={()=>setDocEd(false)} />}
    </Pad>
  );
}
function CompanyForm({ add, onClose, onSave }) {
  const [f, setF] = useState(add); const set=(k,v)=>setF((s)=>({ ...s,[k]:v }));
  return (
    <Modal onClose={onClose} w={480} title="Новая строительная компания">
      <Grid>
        <Fld l="Название" wide><input value={f.name} onChange={(e)=>set("name",e.target.value)} style={inp} /></Fld>
        <Fld l="БИН"><input value={f.bin} onChange={(e)=>set("bin",e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="Город"><select value={f.city} onChange={(e)=>set("city",e.target.value)} style={inp}>{CITIES.map((c)=><option key={c}>{c}</option>)}</select></Fld>
      </Grid>
      <div style={{ ...F, fontWeight:700, fontSize:13.5, margin:"8px 0 8px" }}>Админ компании</div>
      <Grid>
        <Fld l="ФИО"><input value={f.admName} onChange={(e)=>set("admName",e.target.value)} style={inp} /></Fld>
        <Fld l="Email (логин)"><input value={f.admEmail} onChange={(e)=>set("admEmail",e.target.value)} style={inp} /></Fld>
        <Fld l="Пароль"><input value={f.admPass} onChange={(e)=>set("admPass",e.target.value)} placeholder="по умолч. 1234" style={inp} /></Fld>
      </Grid>
      <BtnP disabled={!f.name||!f.admName||!f.admEmail} onClick={()=>onSave(f)}>Создать компанию и админа</BtnP>
    </Modal>
  );
}

/* ---- Настройка банков компании (super) -------------------------- */
function CompanyBanks({ db, patch, companyId, onClose }) {
  const conns = db.connectors.filter((c) => c.companyId === companyId);
  const [selId, setSelId] = useState(conns[0]?.id);
  const [tab, setTab] = useState("conn");
  const sel = db.connectors.find((c) => c.id === selId) || conns[0];
  const upd = (p) => patch((d) => { const c=d.connectors.find((x)=>x.id===sel.id); Object.assign(c, p); return d; });
  const addBank = () => { const k = altynConnector(companyId); k.name="Новый банк"; k.enabled=false; k.restUrl=""; k.soapUrl=""; patch((d)=>{ d.connectors.push(k); return d; }); setSelId(k.id); };
  const co = db.companies.find((c)=>c.id===companyId);
  const CFG = [["conn","Подключение"],["prod","Продукты"],["map","Маппинг"],["state","Статусы"],["test","Проверка"]];
  return (
    <Modal onClose={onClose} w={920} title={`Банки · ${co?.name}`} sub="Интеграция JsonMortgage / ESB для этой компании">
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {conns.map((c)=><button key={c.id} onClick={()=>setSelId(c.id)} style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${c.id===sel?.id?C.indigo:C.line}`, background:c.id===sel?.id?C.indigoSoft:C.panel2, color:c.id===sel?.id?C.indigo:C.sub, cursor:"pointer", ...F, fontSize:13, display:"flex", gap:7, alignItems:"center" }}><span style={{ width:7, height:7, borderRadius:"50%", background:c.enabled?C.green:"#3A4C60" }} />{c.name}</button>)}
        <button onClick={addBank} style={{ padding:"7px 12px", borderRadius:8, border:`1px dashed ${C.line}`, background:C.panel2, color:C.sub, cursor:"pointer", ...F, fontSize:13 }}>+ Банк</button>
      </div>
      {sel && <>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ ...mono, fontSize:12, color:C.sub }}>source: {sel.source} · env: {sel.env}</div>
          <label style={{ display:"flex", gap:7, alignItems:"center", fontSize:13.5, cursor:"pointer" }}><input type="checkbox" checked={sel.enabled} onChange={(e)=>upd({ enabled:e.target.checked })} style={{ accentColor:C.indigo, width:16, height:16 }} />Активно</label>
        </div>
        <div style={{ display:"flex", gap:4, borderBottom:`1px solid ${C.line}`, marginBottom:16 }}>
          {CFG.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{ padding:"8px 14px", border:"none", background:"none", cursor:"pointer", ...F, fontSize:13.5, fontWeight:600, color:tab===k?C.indigo:C.sub, borderBottom:`2px solid ${tab===k?C.indigo:"transparent"}`, marginBottom:-1 }}>{l}</button>)}
        </div>
        {tab==="conn" && <CfgConn c={sel} upd={upd} />}
        {tab==="prod" && <CfgProducts c={sel} upd={upd} />}
        {tab==="map" && <CfgMap c={sel} upd={upd} />}
        {tab==="state" && <CfgStates c={sel} upd={upd} />}
        {tab==="test" && <CfgTest c={sel} />}
      </>}
    </Modal>
  );
}
function CfgConn({ c, upd }) {
  const s=c.seller||{}; const setS=(k,v)=>upd({ seller:{ ...s,[k]:v } });
  return (<div style={{ display:"grid", gap:16 }}>
    <Card title="Соединение">
      <Grid>
        <Fld l="Название"><input value={c.name} onChange={(e)=>upd({ name:e.target.value })} style={inp} /></Fld>
        <Fld l="Среда"><select value={c.env} onChange={(e)=>upd({ env:e.target.value })} style={inp}><option value="test">Test</option><option value="prod">Prod</option></select></Fld>
        <Fld l="REST · StartMortgage" wide><input value={c.restUrl} onChange={(e)=>upd({ restUrl:e.target.value })} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="SOAP · ESB" wide><input value={c.soapUrl} onChange={(e)=>upd({ soapUrl:e.target.value })} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="source"><input value={c.source} onChange={(e)=>upd({ source:e.target.value })} style={inp} /></Fld>
        <Fld l="signType"><input value={c.signType} onChange={(e)=>upd({ signType:e.target.value })} style={inp} /></Fld>
        <Fld l="Auth token" wide><input type="password" value={c.token} onChange={(e)=>upd({ token:e.target.value })} style={{ ...inp, ...mono }} /></Fld>
      </Grid>
    </Card>
    <Card title="Продавец (застройщик)">
      <Grid>
        <Fld l="Наименование"><input value={s.name||""} onChange={(e)=>setS("name",e.target.value)} style={inp} /></Fld>
        <Fld l="БИН"><input value={s.bin||""} onChange={(e)=>setS("bin",e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="branchCode"><input value={s.branchCode||""} onChange={(e)=>setS("branchCode",e.target.value)} style={inp} /></Fld>
        <Fld l="Телефон менеджера"><input value={s.managerPhone||""} onChange={(e)=>setS("managerPhone",e.target.value)} style={{ ...inp, ...mono }} /></Fld>
      </Grid>
    </Card>
  </div>);
}
function CfgProducts({ c, upd }) {
  const set=(i,k,v)=>upd({ products:c.products.map((p,j)=>j===i?{ ...p,[k]:v }:p) });
  const add=()=>upd({ products:[...c.products,{ internal:"Новый", code:"", productRef:"", kind:"mortgage", rate:12, enabled:false }] });
  const del=(i)=>upd({ products:c.products.filter((_,j)=>j!==i) });
  return (<Card title="Продукты">
    <table style={tbl}><thead><tr>{["Продукт","code","ref","Тип","Ставка","Вкл",""].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{c.products.map((p,i)=>(<tr key={i}>
        <td style={td}><input value={p.internal} onChange={(e)=>set(i,"internal",e.target.value)} style={inp} /></td>
        <td style={td}><input value={p.code} onChange={(e)=>set(i,"code",e.target.value)} style={{ ...inp, ...mono }} /></td>
        <td style={td}><input value={p.productRef} onChange={(e)=>set(i,"productRef",e.target.value)} style={{ ...inp, ...mono }} /></td>
        <td style={td}><select value={p.kind} onChange={(e)=>set(i,"kind",e.target.value)} style={{ ...inp, minWidth:110 }}><option value="mortgage">Ипотека</option><option value="installment">Рассрочка</option></select></td>
        <td style={td}><input value={p.rate} onChange={(e)=>set(i,"rate",+e.target.value||0)} style={{ ...inp, ...mono, width:60 }} /></td>
        <td style={{ ...td, textAlign:"center" }}><input type="checkbox" checked={p.enabled} onChange={(e)=>set(i,"enabled",e.target.checked)} style={{ accentColor:C.indigo, width:16, height:16 }} /></td>
        <td style={{ ...td, textAlign:"center" }}><button onClick={()=>del(i)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button></td>
      </tr>))}</tbody>
    </table>
    <button onClick={add} style={addBtn}>+ Продукт</button>
  </Card>);
}
function CfgMap({ c, upd }) {
  const set=(i,k,v)=>upd({ fieldMap:c.fieldMap.map((f,j)=>j===i?{ ...f,[k]:v }:f) });
  const add=()=>upd({ fieldMap:[...c.fieldMap,{ group:"Прочее", path:"", label:"", src:"", req:false }] });
  const del=(i)=>upd({ fieldMap:c.fieldMap.filter((_,j)=>j!==i) });
  return (<Card title="Маппинг полей StartMortgage">
    <div style={{ overflowX:"auto" }}><table style={tbl}><thead><tr>{["Группа","Поле","Название","Источник","Об.",""].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{c.fieldMap.map((f,i)=>(<tr key={i}>
        <td style={td}><input value={f.group} onChange={(e)=>set(i,"group",e.target.value)} style={{ ...inp, minWidth:88 }} /></td>
        <td style={td}><input value={f.path} onChange={(e)=>set(i,"path",e.target.value)} style={{ ...inp, ...mono, minWidth:170 }} /></td>
        <td style={td}><input value={f.label} onChange={(e)=>set(i,"label",e.target.value)} style={{ ...inp, minWidth:110 }} /></td>
        <td style={td}><input value={f.src} onChange={(e)=>set(i,"src",e.target.value)} style={{ ...inp, ...mono, minWidth:130 }} /></td>
        <td style={{ ...td, textAlign:"center" }}><input type="checkbox" checked={!!f.req} onChange={(e)=>set(i,"req",e.target.checked)} style={{ accentColor:C.indigo, width:15, height:15 }} /></td>
        <td style={{ ...td, textAlign:"center" }}><button onClick={()=>del(i)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button></td>
      </tr>))}</tbody>
    </table></div>
    <button onClick={add} style={addBtn}>+ Поле</button>
  </Card>);
}
function CfgStates({ c, upd }) {
  const set=(i,k,v)=>upd({ states:c.states.map((s,j)=>j===i?{ ...s,[k]:v }:s) });
  const add=()=>upd({ states:[...c.states,{ state:"", title:"", internal:"" }] });
  const del=(i)=>upd({ states:c.states.filter((_,j)=>j!==i) });
  return (<Card title="Статусы UpdateOrderState">
    <table style={tbl}><thead><tr>{["state","stateTitle","Внутренний",""].map((h)=><th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{c.states.map((s,i)=>(<tr key={i}>
        <td style={td}><input value={s.state} onChange={(e)=>set(i,"state",e.target.value)} style={{ ...inp, ...mono }} /></td>
        <td style={td}><input value={s.title} onChange={(e)=>set(i,"title",e.target.value)} style={inp} /></td>
        <td style={td}><input value={s.internal} onChange={(e)=>set(i,"internal",e.target.value)} style={{ ...inp, ...mono }} /></td>
        <td style={{ ...td, textAlign:"center" }}><button onClick={()=>del(i)} style={{ background:"none", border:"none", color:C.red, cursor:"pointer" }}>✕</button></td>
      </tr>))}</tbody>
    </table>
    <button onClick={add} style={addBtn}>+ Статус</button>
  </Card>);
}
function CfgTest({ c }) {
  const en = c.products.filter((p)=>p.enabled);
  const [s,setS]=useState({ ref:"AP-100245", iin:"900515312349", phone:"77011234567", amount:45.5, down:12, term:60, pm:"0", pi:0 });
  const set=(k,v)=>setS((x)=>({ ...x,[k]:v })); const prod=en[s.pi]||en[0]||c.products[0];
  const json=useMemo(()=>({ version:c.version, type:"StartMortgage", source:c.source, body:[{ orderNumber:s.ref, desiredProductType:prod?.code||"", amount:String(s.amount*1e6), initialSum:String(s.down*1e6), desiredLoanTerm:String(s.term), desiredPaymentMethod:s.pm, seller:c.seller, customer:[{ taxCode:s.iin, mobilePhone:s.phone, role:"borrower" }] }] }),[c,s,prod]);
  const [phase,setPhase]=useState("idle"); const [offers,setOffers]=useState([]);
  const send=async()=>{ setPhase("sending"); await wait(900); const loan=(s.amount-s.down)*1e6; setOffers(en.map((p,i)=>({ id:i, name:p.internal, rate:p.rate, gesv:p.rate===0?0:+(p.rate+1.2).toFixed(1), monthly:Math.round(annuity(loan,p.rate,p.kind==="installment"?Math.min(s.term,36):s.term)) }))); setPhase("offers"); };
  return (<div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
    <div style={{ display:"grid", gap:14 }}>
      <Card title="Тест данных"><Grid>
        <Fld l="orderNumber"><input value={s.ref} onChange={(e)=>set("ref",e.target.value)} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="Продукт"><select value={s.pi} onChange={(e)=>set("pi",+e.target.value)} style={inp}>{en.map((p,i)=><option key={i} value={i}>{p.internal}</option>)}</select></Fld>
        <Fld l="ИИН"><input value={s.iin} onChange={(e)=>set("iin",e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="Телефон"><input value={s.phone} onChange={(e)=>set("phone",e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
        <Fld l="amount, млн"><input value={s.amount} onChange={(e)=>set("amount",+e.target.value||0)} style={inp} /></Fld>
        <Fld l="down, млн"><input value={s.down} onChange={(e)=>set("down",+e.target.value||0)} style={inp} /></Fld>
      </Grid></Card>
      <Card title="StartMortgage · JSON" note={`POST ${c.restUrl||"—"}`}><pre style={pre}>{JSON.stringify(json,null,2)}</pre></Card>
    </div>
    <div style={{ display:"grid", gap:14 }}>
      <Card title="Прогон"><BtnI onClick={send} disabled={phase==="sending"}>{phase==="sending"?"Отправка…":"Отправить StartMortgage (тест) →"}</BtnI></Card>
      {offers.length>0 && <Card title="SendOffers"><div style={{ display:"grid", gap:8 }}>{offers.map((o)=><div key={o.id} style={{ border:`1px solid ${C.line}`, borderRadius:8, padding:10, display:"flex", justifyContent:"space-between" }}><b style={{ fontSize:13 }}>{o.name}</b><span style={{ ...mono, fontSize:12.5 }}>{o.rate}% · {fmt(o.monthly)} ₸</span></div>)}</div></Card>}
    </div>
  </div>);
}

/* ---- Заявки ------------------------------------------------------ */
const APP_STATE = { new:["Новая",C.sub,"#1A2230"], approved:["Одобрено",C.amber,"#2A2413"], ready:["Готов к регистрации",C.indigo,C.indigoSoft], issued:["Займ выдан",C.green,C.greenSoft], rejected:["Отказ",C.red,"#2A1518"] };
const STATE_KEYS = ["new","approved","ready","issued","rejected"];
function Orders({ db, user, patch }) {
  const [fSt, setFSt] = useState("all"); const [fMgr, setFMgr] = useState("all");
  let list = db.applications;
  if (user.role === "client" || user.role === "manager") list = list.filter((a) => a.createdBy === user.id);
  else if (user.role === "dev_admin") list = list.filter((a) => a.companyId === user.companyId);
  const showMgr = user.role === "dev_admin" || user.role === "super";
  const managers = showMgr ? db.users.filter((u) => u.role === "manager" && (user.role === "super" || u.companyId === user.companyId)) : [];
  const filtered = list.filter((a) => (fSt === "all" || a.state === fSt) && (fMgr === "all" || a.createdBy === fMgr));
  const total = filtered.reduce((sm, a) => sm + (a.product?.loan || a.price || 0), 0);
  const setState = (id, v) => patch((d) => { const a = d.applications.find((x) => x.id === id); if (a) a.state = v; return d; });
  const mgrName = (id) => (db.users.find((u) => u.id === id) || {}).fullName || "—";
  return (
    <Pad title={user.role === "client" ? "Мои заявки" : "Заявки"} sub={`Всего: ${filtered.length} · сумма ${fmt(total)} ₸`}>
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
        {[["all","Все"], ...STATE_KEYS.map((k)=>[k,APP_STATE[k][0]])].map(([k,l])=><button key={k} onClick={()=>setFSt(k)} style={{ padding:"6px 12px", borderRadius:20, border:`1px solid ${C.line}`, cursor:"pointer", ...F, fontSize:12.5, background:fSt===k?C.brand:C.panel, color:fSt===k?"#06131C":C.sub }}>{l}</button>)}
        {showMgr && <select value={fMgr} onChange={(e)=>setFMgr(e.target.value)} style={{ ...inp, maxWidth:220 }}><option value="all">Все менеджеры</option>{managers.map((m)=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select>}
      </div>
      <div style={{ background:C.panel, border:`1px solid ${C.line}`, borderRadius:12, overflow:"auto" }}>
        <table style={{ ...tbl, minWidth:860 }}><thead><tr>{["Заявка","Дата", ...(showMgr?["Менеджер"]:[]), "Клиент","ЖК","Продукт","Сумма","Статус"].map((h)=><th key={h} style={{ ...th, padding:"11px 14px" }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((a)=>{ const cx=db.complexes.find((c)=>c.id===a.complexId); const st=APP_STATE[a.state]||APP_STATE.new; return (<tr key={a.id} style={{ borderBottom:`1px solid ${C.line}` }}>
            <td style={{ padding:"10px 14px", ...mono }}>{a.ref}</td>
            <td style={{ padding:"10px 14px", color:C.sub }}>{a.created}</td>
            {showMgr && <td style={{ padding:"10px 14px" }}>{mgrName(a.createdBy)}</td>}
            <td style={{ padding:"10px 14px" }}>{a.clientName}</td>
            <td style={{ padding:"10px 14px" }}>{cx?.name||"—"}</td>
            <td style={{ padding:"10px 14px" }}>{a.product?.bank} · {a.product?.name}</td>
            <td style={{ padding:"10px 14px", ...mono }}>{fmt(a.product?.loan||a.price)} ₸</td>
            <td style={{ padding:"10px 14px" }}>{showMgr ? <select value={a.state} onChange={(e)=>setState(a.id,e.target.value)} style={{ ...inp, padding:"5px 8px", width:160 }}>{STATE_KEYS.map((k)=><option key={k} value={k}>{APP_STATE[k][0]}</option>)}</select> : <span style={{ fontSize:12, fontWeight:600, color:st[1], background:st[2], padding:"4px 10px", borderRadius:12 }}>{st[0]}</span>}</td>
          </tr>); })}
          {filtered.length===0 && <tr><td colSpan={showMgr?8:7} style={{ padding:24, textAlign:"center", color:C.sub }}>Заявок нет.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pad>
  );
}

/* ---- Вход (главная страница) ------------------------------------ */
function LoginPage({ db, patch, onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [err, setErr] = useState("");
  const [rn, setRn] = useState(""); const [rp, setRp] = useState("");
  const login = () => { const u = db.users.find((x) => x.email === email.trim() && x.password === pass); if (u) onLogin(u.id); else setErr("Неверный email или пароль"); };
  const register = () => { if (!rn.trim() || !validPhone(rp)) { setErr("Заполните имя и телефон"); return; } const id = uid("u"); patch((d) => { d.users.push({ id, role: "client", companyId: null, fullName: rn.trim(), email: "", phone: phoneD(rp), password: "" }); return d; }); onLogin(id); };
  const demos = db.users.filter((u) => ["u-super","u-h-adm","u-h-mgr","u-bi-adm","u-client"].includes(u.id));
  return (
    <div style={{ minHeight:"100vh", display:"grid", gridTemplateColumns:"1.1fr 1fr" }}>
      <div style={{ background:C.sidebar, color:"#dfe3ea", padding:"clamp(30px,6vw,70px)", display:"flex", flexDirection:"column", justifyContent:"center" }}>
        <div style={{ fontWeight:700, fontSize:26, letterSpacing:".5px" }}>krish<span style={{ color:C.gold }}>-a</span></div>
        <div style={{ ...F, fontWeight:700, fontSize:"clamp(24px,3vw,38px)", marginTop:18, lineHeight:1.1 }}>Маркетплейс новостроек и кредитный брокер</div>
        <div style={{ color:"#aab1bd", fontSize:15, marginTop:14, maxWidth:440, lineHeight:1.5 }}>Витрина ЖК, онлайн-ипотека и рассрочка, интеграция с банками — в одном кабинете.</div>
      </div>
      <div style={{ display:"grid", placeItems:"center", padding:24 }}>
        <div style={{ width:380, maxWidth:"100%" }}>
          <div style={{ display:"flex", gap:6, marginBottom:16 }}>{[["login","Вход"],["reg","Регистрация"]].map(([k,l])=><button key={k} onClick={()=>{ setMode(k); setErr(""); }} style={{ flex:1, padding:"9px", borderRadius:8, border:`1px solid ${mode===k?C.brand:C.line}`, background:mode===k?C.brandSoft:"#fff", color:mode===k?C.brandDk:C.sub, cursor:"pointer", ...F, fontSize:13.5, fontWeight:600 }}>{l}</button>)}</div>
          {mode==="login" ? (<>
            <Fld l="Email"><input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="admin@krish-a.kz" style={inp} /></Fld>
            <Fld l="Пароль"><input type="password" value={pass} onChange={(e)=>setPass(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&login()} style={inp} /></Fld>
            {err && <div style={{ color:C.red, fontSize:13, marginBottom:10 }}>{err}</div>}
            <BtnP onClick={login}>Войти</BtnP>
            <div style={{ marginTop:16, borderTop:`1px solid ${C.line}`, paddingTop:12 }}>
              <div style={{ fontSize:12, color:C.sub, marginBottom:8 }}>Демо-вход:</div>
              <div style={{ display:"grid", gap:6 }}>{demos.map((u)=><button key={u.id} onClick={()=>onLogin(u.id)} style={{ textAlign:"left", padding:"8px 12px", borderRadius:8, border:`1px solid ${C.line}`, background:C.panel2, cursor:"pointer", ...F, fontSize:13 }}>{roleName(u.role)} — {u.fullName}</button>)}</div>
            </div>
          </>) : (<>
            <Fld l="Имя"><input value={rn} onChange={(e)=>setRn(e.target.value)} style={inp} /></Fld>
            <Fld l="Телефон"><input value={fmtPhone(rp)} onChange={(e)=>setRp(phoneD(e.target.value))} placeholder="+7 (7__) ___-__-__" style={{ ...inp, ...mono }} /></Fld>
            {err && <div style={{ color:C.red, fontSize:13, marginBottom:10 }}>{err}</div>}
            <BtnP onClick={register}>Зарегистрироваться</BtnP>
          </>)}
        </div>
      </div>
    </div>
  );
}

/* ---- Диаграммы (SVG, без зависимостей) -------------------------- */
function Kpi({ l, v, accent }) { return <div style={{ background:C.panel2, color:C.ink, border:`1px solid ${accent?C.brand:C.line}`, borderRadius:12, padding:16 }}><div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>{l}</div><div style={{ fontWeight:700, fontSize:22, color:accent?C.green:C.brand }}>{v}</div></div>; }
function BarChart({ data, color=C.brand, h=190 }) {
  const w=Math.max(360, data.length*46); const max=Math.max(1, ...data.map((d)=>d.value)); const bw=w/Math.max(1,data.length);
  return (<svg width="100%" viewBox={`0 0 ${w} ${h+28}`} style={{ maxWidth:"100%" }}>
    {data.map((d,i)=>{ const bh=(d.value/max)*h; return (<g key={i}>
      <rect x={i*bw+bw*0.2} y={h-bh} width={bw*0.6} height={Math.max(0,bh)} rx="3" fill={color} />
      {d.value>0 && <text x={i*bw+bw/2} y={h-bh-4} fontSize="9" fill={C.ink} textAnchor="middle">{d.value}</text>}
      <text x={i*bw+bw/2} y={h+16} fontSize="8.5" fill={C.sub} textAnchor="middle">{d.label}</text>
    </g>); })}
  </svg>);
}
function PieChart({ data, size=170 }) {
  const total=data.reduce((sm,d)=>sm+d.value,0); const r=size/2, cx=r, cy=r;
  if(total===0) return <svg width={size} height={size}><circle cx={cx} cy={cy} r={r-1} fill="#eef0f2" /></svg>;
  let acc=0;
  return (<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    {data.filter((d)=>d.value>0).map((d,i)=>{ const a0=acc/total*2*Math.PI; acc+=d.value; const a1=acc/total*2*Math.PI; const large=(a1-a0)>Math.PI?1:0;
      const x0=cx+r*Math.sin(a0), y0=cy-r*Math.cos(a0), x1=cx+r*Math.sin(a1), y1=cy-r*Math.cos(a1);
      return <path key={i} d={`M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`} fill={d.color} />; })}
    <circle cx={cx} cy={cy} r={r*0.55} fill="#fff" />
  </svg>);
}
function Dashboard({ db, user }) {
  const [period, setPeriod] = useState("30");
  const apps = user.role === "super" ? db.applications : db.applications.filter((a) => a.companyId === user.companyId);
  const today = nowD(); const days = period === "all" ? null : +period;
  const inRange = (a) => { if (period === "all") return true; const diff = (new Date(today) - new Date(a.created)) / 86400000; return diff >= 0 && diff < days; };
  const scoped = apps.filter(inRange);
  const sum = scoped.reduce((sm, a) => sm + (a.product?.loan || a.price || 0), 0);
  const todayN = apps.filter((a) => a.created === today).length;
  const monthN = apps.filter((a) => a.created.slice(0,7) === today.slice(0,7)).length;
  let bars = [];
  if (period === "all") { const m = {}; apps.forEach((a) => { const k = a.created.slice(0,7); m[k] = (m[k]||0)+1; }); bars = Object.keys(m).sort().slice(-12).map((k) => ({ label: k.slice(5)+"."+k.slice(2,4), value: m[k] })); }
  else { const n = days; for (let i = n-1; i >= 0; i--) { const dt = new Date(today); dt.setDate(dt.getDate()-i); const k = dt.toISOString().slice(0,10); bars.push({ label: k.slice(8)+"."+k.slice(5,7), value: apps.filter((a)=>a.created===k).length }); } if (n > 14) bars = bars.filter((_, i) => i % Math.ceil(n/14) === 0); }
  const pie = STATE_KEYS.map((k) => ({ label: APP_STATE[k][0], value: scoped.filter((a) => a.state === k).length, color: APP_STATE[k][1] }));
  return (
    <Pad title="Дашборд продаж" sub={user.role === "super" ? "По всей платформе" : "По вашей компании"}>
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>{[["7","7 дней"],["30","30 дней"],["all","Всё время"]].map(([k,l])=><button key={k} onClick={()=>setPeriod(k)} style={{ padding:"7px 14px", borderRadius:20, border:`1px solid ${C.line}`, cursor:"pointer", ...F, fontSize:13, background:period===k?C.brand:C.panel, color:period===k?"#06131C":C.sub }}>{l}</button>)}</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:18 }}>
        <Kpi l="Заявок сегодня" v={todayN} /><Kpi l="Заявок в этом месяце" v={monthN} /><Kpi l="Сумма за период" v={fmt(sum/1e6)+" млн ₸"} accent />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1.6fr 1fr", gap:16 }}>
        <div style={{ background:C.panel, border:`1px solid ${C.line}`, borderRadius:12, padding:16 }}>
          <div style={{ ...F, fontWeight:700, fontSize:14, marginBottom:10 }}>Заявки {period==="all"?"по месяцам":"по дням"}</div>
          <BarChart data={bars} />
        </div>
        <div style={{ background:C.panel, border:`1px solid ${C.line}`, borderRadius:12, padding:16 }}>
          <div style={{ ...F, fontWeight:700, fontSize:14, marginBottom:10 }}>Статусы заявок</div>
          <div style={{ display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
            <PieChart data={pie} />
            <div style={{ display:"grid", gap:6 }}>{pie.map((sg)=><div key={sg.label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5 }}><span style={{ width:11, height:11, borderRadius:3, background:sg.color }} />{sg.label}: <b>{sg.value}</b></div>)}</div>
          </div>
        </div>
      </div>
    </Pad>
  );
}

/* ---- Сайт: публикация витрины + домен --------------------------- */
function SiteSettings({ db, user, patch }) {
  const co = db.companies.find((c) => c.id === user.companyId);
  const site = co.site || { enabled:false, domain:"" };
  const setSite = (k,v) => patch((d) => { const c=d.companies.find((x)=>x.id===co.id); c.site=c.site||{}; c.site[k]=v; return d; });
  const mine = db.complexes.filter((c) => c.companyId === co.id);
  const togglePublic = (id,v) => patch((d) => { const c=d.complexes.find((x)=>x.id===id); if(c) c.isPublic=v; return d; });
  const [reqEdit,setReqEdit]=useState(false); const [tplEdit,setTplEdit]=useState(false);
  const pub = mine.filter((c)=>c.isPublic);
  return (
    <Pad title="Сайт" sub="Управление публичной витриной и доменом, где она отображается">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <Card title="Публикация витрины">
          <label style={{ display:"flex", gap:10, alignItems:"center", fontSize:14, marginBottom:12, cursor:"pointer" }}><input type="checkbox" checked={!!site.enabled} onChange={(e)=>setSite("enabled",e.target.checked)} style={{ accentColor:C.brand, width:17, height:17 }} />Сайт опубликован и доступен клиентам</label>
          <Fld l="Домен, где отображать"><input value={site.domain||""} onChange={(e)=>setSite("domain",e.target.value)} placeholder="hayat.krish-a.kz или ваш домен" style={{ ...inp, ...mono }} /></Fld>
          {site.enabled && site.domain ? <div style={{ fontSize:13, color:C.green }}>Витрина доступна на: {site.domain}</div> : <div style={{ fontSize:13, color:C.sub }}>Укажите домен и включите публикацию.</div>}
        </Card>
        <Card title="Реквизиты и документ" note="Реквизиты подставляются в брокерский документ вместо шаблонных">
          <BtnG onClick={()=>setReqEdit(true)}>Реквизиты компании</BtnG>
          <div style={{ height:8 }} />
          <BtnG onClick={()=>setTplEdit(true)}>Шаблон документа</BtnG>
        </Card>
      </div>
      <Card title={`Отображаемые ЖК (${pub.length} из ${mine.length})`} note="Публичные видны клиентам; непубличные — только сотрудникам">
        <div style={{ display:"grid", gap:6 }}>{mine.map((cx)=>(<label key={cx.id} style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, padding:"5px 0", cursor:"pointer" }}><input type="checkbox" checked={cx.isPublic} onChange={(e)=>togglePublic(cx.id,e.target.checked)} style={{ accentColor:C.brand, width:16, height:16 }} />{cx.name} <span style={{ color:C.sub }}>· {cx.city}</span></label>))}
        {mine.length===0 && <div style={{ color:C.sub }}>Сначала создайте ЖК во вкладке «ЖК».</div>}</div>
      </Card>
      {reqEdit && <RequisitesForm co={co} patch={patch} onClose={()=>setReqEdit(false)} />}
      {tplEdit && <DocTemplateForm db={db} patch={patch} onClose={()=>setTplEdit(false)} />}
    </Pad>
  );
}
function RequisitesForm({ co, patch, onClose }) {
  const [r,setR]=useState({ name:co.name, bin:co.bin, address:"", director:"", phone:"", iik:"", bank:"", ...(co.requisites||{}) });
  const set=(k,v)=>setR((sm)=>({ ...sm,[k]:v }));
  return (<Modal onClose={onClose} w={500} title="Реквизиты компании" sub="Подставляются в документ вместо шаблонных">
    <Grid>
      <Fld l="Наименование" wide><input value={r.name} onChange={(e)=>set("name",e.target.value)} style={inp} /></Fld>
      <Fld l="БИН"><input value={r.bin} onChange={(e)=>set("bin",e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
      <Fld l="Руководитель"><input value={r.director} onChange={(e)=>set("director",e.target.value)} style={inp} /></Fld>
      <Fld l="Адрес" wide><input value={r.address} onChange={(e)=>set("address",e.target.value)} style={inp} /></Fld>
      <Fld l="Телефон"><input value={r.phone} onChange={(e)=>set("phone",e.target.value)} style={{ ...inp, ...mono }} /></Fld>
      <Fld l="ИИК"><input value={r.iik} onChange={(e)=>set("iik",e.target.value)} style={{ ...inp, ...mono }} /></Fld>
      <Fld l="Банк"><input value={r.bank} onChange={(e)=>set("bank",e.target.value)} style={inp} /></Fld>
    </Grid>
    <BtnP onClick={()=>{ patch((d)=>{ const c=d.companies.find((x)=>x.id===co.id); c.requisites=r; return d; }); onClose(); }}>Сохранить</BtnP>
  </Modal>);
}
const DEFAULT_DOC = `СОГЛАСИЕ И ЗАЯВЛЕНИЕ НА ОФОРМЛЕНИЕ ИПОТЕКИ / РАССРОЧКИ

1. АГЕНТ (застройщик)
Наименование: {{company.name}}
БИН: {{company.bin}}
Адрес: {{company.address}}
Руководитель: {{company.director}}
Телефон: {{company.phone}}
ИИК / Банк: {{company.iik}} / {{company.bank}}

2. КЛИЕНТ (заёмщик)
ФИО: {{client.fio}}
ИИН: {{client.iin}}
Дата рождения: {{client.birth}}   Пол: {{client.sex}}
Документ: {{client.doc}}, выдан {{client.docOrg}}
Телефон: {{client.phone}}
Адрес проживания: {{client.address}}
Ежемесячный доход: {{client.income}} тг

3. ПРЕДМЕТ
Объект: {{complex}}
Помещение: {{apartment}}
Стоимость: {{amount}} тг   Первоначальный взнос: {{down}} тг
Срок: {{term}} мес   Цель: {{purpose}}

4. СОГЛАСИЕ
Клиент даёт согласие Агенту {{company.name}} на сбор, обработку и передачу
персональных данных, а также на запрос сведений в ПКБ/ГКБ и ГЦВП для
рассмотрения заявки банками-партнёрами.

Дата: {{date}}                       Подпись клиента: __________________`;
function fillDoc(tpl, co, client, obj, amount) {
  const r = (co && co.requisites) || {};
  const map = {
    "company.name": r.name||co?.name||"", "company.bin": r.bin||co?.bin||"", "company.address": r.address||"", "company.director": r.director||"", "company.phone": r.phone||"", "company.iik": r.iik||"", "company.bank": r.bank||"",
    "client.fio": client.fio||"", "client.iin": client.iin||"", "client.birth": client.birth||"", "client.sex": client.sex||"", "client.phone": fmtPhone(client.phone)||"", "client.doc": client.doc||"", "client.docOrg": client.docOrg||"", "client.address": client.address||"", "client.income": client.income?fmt(client.income):"",
    "complex": obj.complex||"", "apartment": obj.apartment||"", "amount": amount?fmt(amount):"", "down": obj.down?fmt(obj.down):"", "term": obj.term||"", "purpose": obj.purpose||"", "date": nowD()
  };
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, k) => (k in map ? map[k] : ""));
}
function printDoc(title, text) {
  try { const w = window.open("", "_blank"); if (!w) return; const esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    w.document.write(`<html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Georgia,'Times New Roman',serif;padding:48px;white-space:pre-wrap;line-height:1.55;font-size:13pt;}</style></head><body>${esc}</body></html>`); w.document.close(); w.focus(); w.print();
  } catch (e) {}
}
function DocTemplateForm({ db, patch, onClose }) {
  const [t,setT]=useState((db.settings && db.settings.brokerDoc) || DEFAULT_DOC);
  return (<Modal onClose={onClose} w={640} title="Шаблон брокерского документа" sub="Плейсхолдеры: {{company.name}}, {{company.bin}}, {{client.fio}}, {{client.iin}}, {{client.birth}}, {{client.income}}, {{complex}}, {{apartment}}, {{amount}}, {{down}}, {{term}}, {{purpose}}, {{date}}">
    <textarea value={t} onChange={(e)=>setT(e.target.value)} rows={16} style={{ ...inp, ...mono, fontSize:12.5, resize:"vertical", lineHeight:1.5 }} />
    <div style={{ display:"flex", gap:10, marginTop:12 }}><BtnG onClick={()=>setT(DEFAULT_DOC)}>Сбросить к образцу</BtnG><BtnP onClick={()=>{ patch((d)=>{ d.settings=d.settings||{}; d.settings.brokerDoc=t; return d; }); onClose(); }}>Сохранить</BtnP></div>
  </Modal>);
}

/* ---- Рабочий стол менеджера: путь забивки заявки ---------------- */
function ManagerDesk({ db, user, patch }) {
  const co = db.companies.find((c) => c.id === user.companyId);
  const myCx = db.complexes.filter((c) => c.companyId === user.companyId && (user.role !== "manager" || (user.complexes||[]).includes(c.id)));
  const STEPS = ["Клиент","Адрес и доход","Объект и заём","Согласие"];
  const [step, setStep] = useState(0);
  const [cl, setCl] = useState({ fio:"", iin:"", birth:"", sex:"", phone:"", doc:"", docOrg:"", address:"", income:"" });
  const [cxId, setCxId] = useState(myCx[0]?.id||""); const [aptId, setAptId] = useState("");
  const [amount, setAmount] = useState(""); const [down, setDown] = useState(""); const [term, setTerm] = useState("180"); const [purpose, setPurpose] = useState("Покупка квартиры (ипотека)");
  const [cons, setCons] = useState({ pd:false, pkb:false, gcvp:false }); const [msg, setMsg] = useState("");
  const set = (k,v) => setCl((sm)=>({ ...sm,[k]:v }));
  const apts = db.apartments.filter((a)=>a.complexId===cxId);
  const cx = db.complexes.find((c)=>c.id===cxId); const apt = apts.find((a)=>a.id===aptId);
  const amt = apt ? apt.price : (+amount||0);
  const iinOk = validateIin(cl.iin), phoneOk = validPhone(cl.phone);
  const tpl = (db.settings && db.settings.brokerDoc) || DEFAULT_DOC;
  const docText = fillDoc(tpl, co, cl, { complex: cx?cx.name:"", apartment: apt?`${apt.rooms}-комн. ${apt.area} м², блок ${apt.block}`:"", down:+down||0, term, purpose }, amt);
  const isAdmin = user.role==="dev_admin" || user.role==="super";
  const [tplEdit,setTplEdit]=useState(false); const [reqEdit,setReqEdit]=useState(false);
  const stepOk = [ cl.fio.trim() && iinOk && phoneOk, true, amt>0, cons.pd && cons.pkb && cons.gcvp ][step];
  const createApp = () => { const r="AP-"+Math.floor(100000+Math.random()*899999);
    patch((d)=>{ d.applications.unshift({ id:uid("app"), ref:r, orderId:"", companyId:user.companyId, complexId:cxId||null, apartmentId:aptId||null, createdBy:user.id, clientName:cl.fio, clientIin:cl.iin, clientPhone:cl.phone, price:amt, down:+down||0, months:+term||0, product:{ bank:"—", name:purpose, loan:amt }, state:"new", created:nowD() }); return d; });
    setMsg("Заявка "+r+" создана — во вкладке «Заявки»."); };
  return (
    <Pad title="Рабочий стол" sub="Путь забивки заявки: данные клиента → адрес и доход → объект и заём → согласие и документ">
      {isAdmin && <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}><button onClick={()=>setReqEdit(true)} style={miniBtn}>Реквизиты компании</button><button onClick={()=>setTplEdit(true)} style={miniBtn}>Шаблон документа</button></div>}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {STEPS.map((t,i)=><div key={t} style={{ flex:"1 1 130px", minWidth:110 }}><div style={{ height:4, borderRadius:3, background:i<=step?C.brand:C.line, marginBottom:5 }} /><span style={{ fontSize:11.5, color:i<=step?C.ink:C.sub }}>{i+1}. {t}</span></div>)}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.05fr", gap:18, alignItems:"start" }}>
        <Card title={STEPS[step]}>
          {step===0 && <>
            <Fld l="ФИО клиента"><input value={cl.fio} onChange={(e)=>set("fio",e.target.value)} style={inp} /></Fld>
            <Grid>
              <Fld l="ИИН"><div style={{ position:"relative" }}><input value={cl.iin} maxLength={12} onChange={(e)=>set("iin",e.target.value.replace(/\D/g,""))} placeholder="12 цифр" style={{ ...inp, ...mono, borderColor: cl.iin.length===12?(iinOk?C.green:C.red):C.line }} /><Tick show={cl.iin.length===12} ok={iinOk} /></div></Fld>
              <Fld l="Дата рождения"><input value={cl.birth} onChange={(e)=>set("birth",e.target.value)} placeholder="ДД.ММ.ГГГГ" style={{ ...inp, ...mono }} /></Fld>
              <Fld l="Пол"><select value={cl.sex} onChange={(e)=>set("sex",e.target.value)} style={inp}><option value="">—</option><option>Мужской</option><option>Женский</option></select></Fld>
              <Fld l="Телефон"><input value={fmtPhone(cl.phone)} onChange={(e)=>set("phone",phoneD(e.target.value))} placeholder="+7 (7__) ___-__-__" style={{ ...inp, ...mono }} /></Fld>
              <Fld l="Документ (№ уд.)"><input value={cl.doc} onChange={(e)=>set("doc",e.target.value)} style={inp} /></Fld>
              <Fld l="Кем выдан"><input value={cl.docOrg} onChange={(e)=>set("docOrg",e.target.value)} placeholder="МВД РК" style={inp} /></Fld>
            </Grid>
          </>}
          {step===1 && <>
            <Fld l="Адрес проживания"><input value={cl.address} onChange={(e)=>set("address",e.target.value)} style={inp} /></Fld>
            <Fld l="Ежемесячный доход, тг"><input value={cl.income} onChange={(e)=>set("income",e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
          </>}
          {step===2 && <>
            <Grid>
              <Fld l="ЖК"><select value={cxId} onChange={(e)=>{ setCxId(e.target.value); setAptId(""); }} style={inp}><option value="">—</option>{myCx.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Fld>
              <Fld l="Квартира"><select value={aptId} onChange={(e)=>setAptId(e.target.value)} style={inp}><option value="">—</option>{apts.map((a)=><option key={a.id} value={a.id}>{a.rooms}к · {a.area}м² · {fmt(a.price)}₸</option>)}</select></Fld>
            </Grid>
            {!apt && <Fld l="Стоимость, тг (если без квартиры)"><input value={amount} onChange={(e)=>setAmount(e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>}
            <Grid>
              <Fld l="Первонач. взнос, тг"><input value={down} onChange={(e)=>setDown(e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
              <Fld l="Срок, мес"><input value={term} onChange={(e)=>setTerm(e.target.value.replace(/\D/g,""))} style={{ ...inp, ...mono }} /></Fld>
            </Grid>
            <Fld l="Цель"><select value={purpose} onChange={(e)=>setPurpose(e.target.value)} style={inp}><option>Покупка квартиры (ипотека)</option><option>Рассрочка</option><option>7-20-25</option></select></Fld>
            <div style={box}>Сумма займа: <b style={mono}>{fmt(Math.max(0, amt-(+down||0)))} тг</b></div>
          </>}
          {step===3 && <>
            <p style={{ fontSize:13.5, color:C.sub, marginTop:0 }}>Клиент подписывает согласия — затем документ доступен на печать и подписание.</p>
            {[["pd","Согласие на сбор и обработку персональных данных"],["pkb","Согласие на запрос в кредитное бюро (ПКБ/ГКБ)"],["gcvp","Согласие на запрос в ГЦВП"]].map(([k,t])=>(
              <label key={k} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:13.5, marginBottom:12, cursor:"pointer", lineHeight:1.45 }}><input type="checkbox" checked={cons[k]} onChange={(e)=>setCons({ ...cons,[k]:e.target.checked })} style={{ accentColor:C.brand, width:17, height:17, marginTop:1 }} />{t}</label>
            ))}
          </>}
          <div style={{ display:"flex", gap:10, marginTop:8 }}>
            {step>0 && <BtnG onClick={()=>setStep(step-1)}>Назад</BtnG>}
            {step<3 ? <BtnP disabled={!stepOk} onClick={()=>setStep(step+1)}>Далее →</BtnP> : <BtnP disabled={!stepOk} onClick={createApp}>Создать заявку</BtnP>}
          </div>
          {msg && <div style={{ marginTop:10, fontSize:13, color:C.green }}>{msg}</div>}
        </Card>
        <Card title="Документ на распечатку / подписание" note="Реквизиты компании + данные клиента">
          <div style={{ ...mono, fontSize:11, whiteSpace:"pre-wrap", lineHeight:1.5, background:C.panel2, border:`1px solid ${C.line}`, borderRadius:8, padding:14, maxHeight:400, overflow:"auto" }}>{docText}</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
            <BtnG onClick={()=>printDoc("Согласие клиента", docText)}>Печать</BtnG>
            <button onClick={()=>setMsg("Отправлено на подписание через eGov Mobile (демо).")} style={miniBtn}>eGov Mobile</button>
            <button onClick={()=>setMsg("Отправлено на подписание в УЦ ПКБ (демо).")} style={miniBtn}>УЦ ПКБ</button>
          </div>
        </Card>
      </div>
      {tplEdit && <DocTemplateForm db={db} patch={patch} onClose={()=>setTplEdit(false)} />}
      {reqEdit && <RequisitesForm co={co} patch={patch} onClose={()=>setReqEdit(false)} />}
    </Pad>
  );
}

/* ---- Банки (только главный админ): доступ по застройщикам ------- */
function BanksAdmin({ db, patch }) {
  const [coId, setCoId] = useState(db.companies[0]?.id);
  const conns = db.connectors.filter((c) => c.companyId === coId);
  const [selId, setSelId] = useState(conns[0]?.id);
  const [tab, setTab] = useState("conn");
  const sel = db.connectors.find((c) => c.id === selId && c.companyId === coId) || conns[0];
  const upd = (pt) => patch((d) => { const c=d.connectors.find((x)=>x.id===sel.id); Object.assign(c, pt); return d; });
  const addBank = () => { const k = altynConnector(coId); k.name="Новый банк"; k.enabled=false; k.restUrl=""; k.soapUrl=""; patch((d)=>{ d.connectors.push(k); return d; }); setSelId(k.id); };
  const co = db.companies.find((c)=>c.id===coId);
  const CFG=[["conn","Подключение"],["prod","Продукты"],["map","Маппинг"],["state","Статусы"],["test","Проверка"]];
  return (
    <Pad title="Банки и продукты" sub="Назначьте каждому застройщику доступные банки и продукты-коннекторы">
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:14, flexWrap:"wrap" }}>
        <span style={{ fontSize:13, color:C.sub }}>Застройщик:</span>
        <select value={coId} onChange={(e)=>{ const v=e.target.value; setCoId(v); const cc=db.connectors.filter((c)=>c.companyId===v); setSelId(cc[0]?.id); setTab("conn"); }} style={{ ...inp, maxWidth:320 }}>{db.companies.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {conns.map((c)=><button key={c.id} onClick={()=>setSelId(c.id)} style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${c.id===sel?.id?C.indigo:C.line}`, background:c.id===sel?.id?C.indigoSoft:C.panel2, color:c.id===sel?.id?C.indigo:C.sub, cursor:"pointer", ...F, fontSize:13, display:"flex", gap:7, alignItems:"center" }}><span style={{ width:7, height:7, borderRadius:"50%", background:c.enabled?C.green:"#3A4C60" }} />{c.name}</button>)}
        <button onClick={addBank} style={{ padding:"7px 12px", borderRadius:8, border:`1px dashed ${C.line}`, background:C.panel2, color:C.sub, cursor:"pointer", ...F, fontSize:13 }}>+ Банк</button>
      </div>
      {sel && <>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div style={{ ...mono, fontSize:12, color:C.sub }}>source: {sel.source} · env: {sel.env}</div>
          <label style={{ display:"flex", gap:7, alignItems:"center", fontSize:13.5, cursor:"pointer" }}><input type="checkbox" checked={sel.enabled} onChange={(e)=>upd({ enabled:e.target.checked })} style={{ accentColor:C.indigo, width:16, height:16 }} />Активно</label>
        </div>
        <div style={{ display:"flex", gap:4, borderBottom:`1px solid ${C.line}`, marginBottom:16 }}>
          {CFG.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{ padding:"8px 14px", border:"none", background:"none", cursor:"pointer", ...F, fontSize:13.5, fontWeight:600, color:tab===k?C.indigo:C.sub, borderBottom:`2px solid ${tab===k?C.indigo:"transparent"}`, marginBottom:-1 }}>{l}</button>)}
        </div>
        {tab==="conn" && <CfgConn c={sel} upd={upd} />}
        {tab==="prod" && <CfgProducts c={sel} upd={upd} />}
        {tab==="map" && <CfgMap c={sel} upd={upd} />}
        {tab==="state" && <CfgStates c={sel} upd={upd} />}
        {tab==="test" && <CfgTest c={sel} />}
      </>}
    </Pad>
  );
}

/* ---- Общие UI ---------------------------------------------------- */
function Pad({ title, sub, children }) { return <div style={{ maxWidth:1160, margin:"0 auto", padding:"22px clamp(14px,4vw,40px)" }}><h1 style={{ ...F, fontWeight:700, fontSize:24, margin:"0 0 4px" }}>{title}</h1>{sub && <div style={{ fontSize:13.5, color:C.sub, marginBottom:18 }}>{sub}</div>}{children}</div>; }
function Modal({ title, sub, w = 520, children, onClose }) {
  return (<div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(20,24,33,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
    <div style={{ background: C.panel, borderRadius: 16, width: w, maxWidth: "100%", maxHeight: "94vh", overflow: "auto" }}>
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "start", position: "sticky", top: 0, background: C.panel, zIndex: 2 }}>
        <div><div style={{ ...F, fontWeight: 700, fontSize: 18 }}>{title}</div>{sub && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{sub}</div>}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.sub, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: 22 }}>{children}</div>
    </div>
  </div>);
}
function Card({ title, note, children }) { return <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>{title && <div style={{ ...F, fontWeight: 700, fontSize: 14 }}>{title}</div>}{note && <div style={{ ...mono, fontSize: 11.5, color: C.sub, margin: "2px 0 10px" }}>{note}</div>}{!note && title && <div style={{ height: 10 }} />}{children}</div>; }
function Grid({ children }) { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>; }
function Fld({ l, wide, children }) { return <label style={{ display: "block", gridColumn: wide ? "1 / -1" : "auto", marginBottom: 10 }}><span style={{ fontSize: 12, color: C.sub, display: "block", marginBottom: 4 }}>{l}</span>{children}</label>; }
function Metr({ l, v }) { return <div><div style={{ fontSize: 11, color: C.sub }}>{l}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div></div>; }
function Tick({ show, ok }) { return <span style={{ position: "absolute", right: 12, top: 11, fontSize: 14, fontWeight: 700, color: ok ? C.green : C.red }}>{show ? (ok ? "✓" : "✗") : ""}</span>; }
function Slider({ l, v, min, max, val, on }) { return <label style={{ display: "block", marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}><span style={{ color: C.sub }}>{l}</span><span style={{ ...mono, fontWeight: 600 }}>{v}</span></div><input type="range" min={min} max={max} value={val} onChange={(e) => on(+e.target.value)} style={{ width: "100%", accentColor: C.brand }} /></label>; }
function BtnP({ children, disabled, onClick, style }) { return <button disabled={disabled} onClick={onClick} style={{ width: "100%", background: disabled ? C.line : C.brand, color: disabled ? C.sub : "#06131C", border: "none", padding: "12px 16px", borderRadius: 10, ...F, fontWeight: 700, fontSize: 14.5, cursor: disabled ? "not-allowed" : "pointer", ...style }}>{children}</button>; }
function BtnG({ children, onClick }) { return <button onClick={onClick} style={{ background: C.panel, color: C.ink, border: `1px solid ${C.line}`, padding: "12px 18px", borderRadius: 10, ...F, fontWeight: 600, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}>{children}</button>; }
function BtnI({ children, onClick, disabled }) { return <button onClick={onClick} disabled={disabled} style={{ width: "100%", background: disabled ? C.line : C.indigo, color: disabled ? C.sub : "#fff", border: "none", padding: "11px 16px", borderRadius: 9, ...F, fontWeight: 600, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer" }}>{children}</button>; }
const inp = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#0A1420", fontSize: 13.5, fontFamily: '"Museo Sans Cyrl", sans-serif', boxSizing: "border-box", color: C.ink };
const box = { background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", fontSize: 13.5, margin: "0 0 14px" };
const miniBtn = { background: C.panel2, border: `1px solid ${C.line}`, color: C.ink, padding: "7px 12px", borderRadius: 7, ...F, fontWeight: 600, fontSize: 12.5, cursor: "pointer" };
const addBtn = { marginTop: 12, background: C.indigoSoft, color: C.indigo, border: "none", padding: "8px 14px", borderRadius: 8, ...F, fontWeight: 600, fontSize: 13, cursor: "pointer" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "7px 8px", fontSize: 11.5, color: C.sub, fontWeight: 600, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
const td = { padding: "7px 8px", borderBottom: `1px solid ${C.line}`, verticalAlign: "middle" };
const pre = { ...mono, fontSize: 11, lineHeight: 1.5, background: "#12141a", color: "#cfe3ff", padding: 12, borderRadius: 10, overflow: "auto", maxHeight: 300, margin: 0 };
