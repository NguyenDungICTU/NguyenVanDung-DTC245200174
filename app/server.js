const express = require("express");
const session = require("express-session");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "day4-quiz-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "quiz_user",
  password: process.env.DB_PASSWORD || "change_me_app",
  database: process.env.DB_NAME || "quiz_db",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10
});

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PREDEFINED_TAGS = ["Docker", "Linux", "Mạng máy tính", "Git", "HTML/CSS", "JavaScript", "SQL", "API", "Bảo mật", "DevOps", "Lập trình", "Cơ bản"];
function normalizeVietnamese(value) {
  return String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi");
}
function parseTags(value) { return String(value || "").split(",").map(x => x.trim()).filter(Boolean); }
function tagsInput(selected = []) {
  return `<div class="tag-row">${PREDEFINED_TAGS.map(tag => `<label class="tag-chip"><input type="checkbox" name="tags" value="${esc(tag)}" style="width:auto;margin-right:6px" ${selected.includes(tag) ? "checked" : ""}>${esc(tag)}</label>`).join("")}</div>`;
}
async function ensureFeatureSchema() {
  try { await pool.query("ALTER TABLE quizzes ADD COLUMN tags VARCHAR(500) NOT NULL DEFAULT ''"); }
  catch (e) { if (e.code !== "ER_DUP_FIELDNAME") throw e; }
  await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reset_user (user_id),
    CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const [old] = await pool.query("SELECT id,title,description FROM quizzes WHERE tags='' OR tags IS NULL");
  for (const q of old) {
    const text = normalizeVietnamese(q.title + " " + (q.description || ""));
    const tags = PREDEFINED_TAGS.filter(t => {
      const key = normalizeVietnamese(t);
      return text.includes(key) || (t==="HTML/CSS" && /html|css/.test(text)) ||
        (t==="Mạng máy tính" && /tcp|ip|dns|osi|mang/.test(text)) ||
        (t==="Bảo mật" && /security|owasp|xss|csrf|bao mat/.test(text)) ||
        (t==="Cơ bản" && /co ban|can ban|basic/.test(text));
    });
    if (tags.length) await pool.query("UPDATE quizzes SET tags=? WHERE id=?", [tags.join(", "), q.id]);
  }
}
const QTYPE_LABEL = { single: "Chọn 1", multiple: "Chọn nhiều", truefalse: "Đúng/Sai", fill: "Điền chỗ trống", order: "Sắp xếp", match: "Ghép cặp" };

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const CSS = `
:root{--bg:#f5f7fb;--bg-card:#fff;--bg-soft:#eef1f6;--text:#1e293b;--muted:#64748b;--primary:#2563eb;--primary-dark:#1d4ed8;--primary-soft:#dbeafe;--success:#16a34a;--danger:#dc2626;--warning:#d97706;--border:#e2e8f0;--shadow:0 1px 3px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06);--radius:12px;--nav-h:56px;--hero:#1d4ed8}
[data-theme="dark"]{--bg:#0f172a;--bg-card:#1e293b;--bg-soft:#334155;--text:#f1f5f9;--muted:#94a3b8;--primary:#38bdf8;--primary-dark:#0ea5e9;--primary-soft:rgba(56,189,248,.15);--border:rgba(148,163,184,.15);--shadow:0 10px 40px rgba(0,0,0,.35);--hero:#1e3a8a}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;line-height:1.55}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
.container{max-width:1120px;margin:0 auto;padding:0 20px 48px}
.topnav{height:var(--nav-h);display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px;background:var(--bg-card);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50}
.brand{font-weight:700;font-size:1.35rem;color:var(--primary)}.brand:hover{text-decoration:none}
.nav-center{display:flex;gap:4px;flex-wrap:wrap}
.nav-center a{padding:8px 14px;border-radius:8px;color:var(--muted);font-weight:500;font-size:.95rem}
.nav-center a:hover,.nav-center a.active{background:var(--bg-soft);color:var(--text);text-decoration:none}
.nav-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.nav-right a,.nav-right span{color:var(--muted);font-size:.92rem}
.theme-btn{border:1px solid var(--border);background:var(--bg-soft);color:var(--text);width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:1rem}
.hero-banner{background:var(--hero);color:#fff;border-radius:16px;padding:36px 32px;margin:28px 0 32px;box-shadow:var(--shadow)}
.hero-banner h1{margin:0 0 10px;font-size:clamp(1.5rem,3vw,2rem)}
.hero-banner p{margin:0 0 20px;opacity:.92;max-width:640px}
.search-row{display:flex;gap:10px;max-width:520px}
.search-row input{flex:1;padding:12px 16px;border:0;border-radius:10px;font:inherit;background:#fff;color:#1e293b}
.search-row button{padding:12px 22px;border:0;border-radius:10px;font:inherit;font-weight:600;background:#fff;color:var(--hero);cursor:pointer}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 0 16px;flex-wrap:wrap}
.section-head h2{margin:0;font-size:1.25rem}.section-head .count{color:var(--muted);font-size:.9rem}
.quiz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.quiz-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px;transition:.15s}
.quiz-card:hover{box-shadow:0 8px 28px rgba(15,23,42,.1);transform:translateY(-2px)}
.quiz-card h3{margin:0;font-size:1.05rem;line-height:1.35}.quiz-card h3 a{color:var(--text)}.quiz-card h3 a:hover{color:var(--primary)}
.quiz-card .desc{color:var(--muted);font-size:.9rem;margin:0;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.quiz-meta{display:flex;flex-wrap:wrap;gap:8px 12px;font-size:.82rem;color:var(--muted)}
.quiz-meta .dot::before{content:"·";margin-right:8px}
.quiz-foot{font-size:.8rem;color:var(--muted);margin-top:4px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 18px;border:0;border-radius:10px;font:inherit;font-weight:600;cursor:pointer}
.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{background:var(--primary-dark)}
.btn-success{background:#16a34a;color:#fff}.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--bg-soft)}.btn-danger{background:var(--danger);color:#fff}.btn-sm{padding:7px 12px;font-size:.88rem}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow);margin-bottom:16px}
.form-card{max-width:440px;margin:32px auto}
label{display:block;margin:12px 0 6px;font-size:.9rem;color:var(--muted)}
input,textarea,select{width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit}
input:focus,textarea:focus,select:focus{outline:2px solid var(--primary);border-color:transparent}
.form-actions{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}
.alert{padding:12px 14px;border-radius:10px;margin-bottom:14px;font-size:.95rem}
.alert-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c}
.alert-ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d}
[data-theme="dark"] .alert-error{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.35);color:#fca5a5}
[data-theme="dark"] .alert-ok{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.35);color:#86efac}
table{width:100%;border-collapse:collapse}th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-size:.8rem;text-transform:uppercase}
.score-big{font-size:2.8rem;font-weight:800;color:var(--primary)}
.answer-option{display:block;padding:12px 14px;margin:8px 0;border-radius:10px;border:1px solid var(--border);background:var(--bg);cursor:pointer}
.answer-option:hover,.answer-option:has(input:checked){border-color:var(--primary);background:var(--primary-soft)}
.answer-option input{width:auto;margin-right:10px}
.q-card{margin-bottom:14px}
.timer-bar{position:sticky;top:var(--nav-h);z-index:40;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;box-shadow:var(--shadow)}
.timer-warn{color:var(--warning);font-weight:700}.timer-danger{color:var(--danger);font-weight:700}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:16px 0}
.stat-box{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.stat-box .num{font-size:1.6rem;font-weight:700;color:var(--primary)}.stat-box .lbl{color:var(--muted);font-size:.85rem}
.muted{color:var(--muted)}.empty{text-align:center;padding:36px;color:var(--muted)}
.footer{text-align:center;padding:28px 16px;color:var(--muted);font-size:.85rem;border-top:1px solid var(--border);margin-top:40px}

.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:18px 0}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;align-items:stretch;margin-top:22px}.admin-search select{min-width:190px;max-width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg-card);color:var(--text);font:inherit}.feature-card{display:block;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:22px;box-shadow:var(--shadow);transition:transform .15s,border-color .15s}
.feature-card:hover{transform:translateY(-3px);border-color:var(--primary);text-decoration:none}
.feature-card .icon{font-size:1.8rem}.feature-card h3{margin:8px 0;color:var(--text)}.feature-card p{margin:0;color:var(--muted)}
.tag-row,.tag-filter{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.tag-chip{display:inline-flex;align-items:center;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);padding:5px 10px;border-radius:999px;font-size:.8rem}
.tag-filter a{display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid var(--border)}
.pagination{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;margin:24px 0}
.pagination a,.pagination span{padding:8px 12px;border:1px solid var(--border);border-radius:9px;background:var(--bg-card)}
.pagination .current{background:var(--primary);color:white}
.admin-header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:28px 0 16px}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.detail-layout{display:grid;grid-template-columns:1fr 280px;gap:20px}
@media(max-width:800px){.detail-layout{grid-template-columns:1fr}.nav-center{display:none}.grid-2{grid-template-columns:1fr}}
.order-list{list-style:none;padding:0;margin:0}.order-list li{display:flex;align-items:center;gap:10px;padding:10px;margin:6px 0;border:1px solid var(--border);border-radius:8px;background:var(--bg)}.order-list input[type=number]{width:64px}.match-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center;margin:8px 0}.qtype-badge{font-size:.75rem;padding:2px 8px;border-radius:6px;background:var(--bg-soft);color:var(--muted);margin-left:8px}.chip{display:inline-block;padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:600;background:var(--primary-soft);color:var(--primary)}
.side-meta dt{color:var(--muted);font-size:.8rem;margin-top:10px}.side-meta dd{margin:2px 0 0;font-weight:600}

.admin-list-page .card { overflow: hidden; }
.admin-search { display:flex; gap:10px; align-items:center; flex:1; min-width:260px; }
.admin-search input { flex:1; min-width:180px; }
.admin-list-toolbar { display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin:14px 0; }
.result-count { margin:10px 0 16px; font-size:14px; }
.table-wrap { width:100%; overflow-x:auto; }
.admin-list-page table { width:100%; border-collapse:collapse; }
.admin-list-page th,.admin-list-page td { padding:12px 14px; text-align:left; border-bottom:1px solid var(--border, #dce3ee); vertical-align:middle; }
.admin-list-page th { white-space:nowrap; font-size:12px; text-transform:uppercase; color:var(--muted, #607086); }
.admin-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.admin-actions select { max-width:130px; }
.pagination { display:flex; align-items:center; justify-content:center; gap:14px; margin:22px 0 8px; }
.page-info { color:var(--muted, #607086); font-size:14px; }
.btn.disabled { opacity:.45; pointer-events:none; }
.admin-quiz-card { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin:12px 0; }
.admin-quiz-main { min-width:0; flex:1; }
.admin-quiz-main h2 { margin-top:0; overflow-wrap:anywhere; }
.admin-quiz-actions { display:flex; gap:8px; align-items:center; flex-shrink:0; }
.tag-chip-static { display:inline-flex; padding:4px 9px; border-radius:999px; background:#e8f0ff; color:#244d8f; font-size:12px; }
@media(max-width:700px) { .admin-search { flex-wrap:wrap; } .admin-search input { flex-basis:100%; } .admin-quiz-card { flex-direction:column; } .admin-quiz-actions { width:100%; } .admin-list-page th,.admin-list-page td { padding:9px; } }

`;

function layout(title, body, user = null, active = "") {
  const navCenter = `
    <a href="/" class="${active==="home"?"active":""}">Trang chủ</a>
    <a href="/" class="${active==="explore"?"active":""}">Khám phá</a>
    ${user ? `<a href="${user.role==="ADMIN"?"/admin/quizzes/new":"/my-quizzes/new"}" class="${active==="create"?"active":""}">Tạo quiz</a>` : ""}
    ${user ? `<a href="/history" class="${active==="history"?"active":""}">Lịch sử</a>` : ""}
    ${user && user.role==="ADMIN" ? `<a href="/admin" class="${active==="admin"?"active":""}">Quản trị</a>` : ""}
  `;
  const navRight = user
    ? `<a href="/account">Tài khoản</a>
      ${user.role==="STUDENT" ? `<a href="/my-quizzes">Quiz của tôi</a>` : ""}
      <span><b>${esc(user.username || user.full_name)}</b></span>
      <a href="/logout">Đăng xuất</a>
      <button type="button" class="theme-btn" onclick="toggleTheme()" title="Sáng/Tối">🌓</button>`
    : `<a href="/login">Đăng nhập</a>
      <a href="/register" class="btn btn-primary btn-sm">Đăng ký</a>
      <button type="button" class="theme-btn" onclick="toggleTheme()" title="Sáng/Tối">🌓</button>`;
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} · Quizz TKQTHT</title>
  <style>${CSS}</style>
  <script>
    (function(){var t=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',t);})();
    function toggleTheme(){var c=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',c);localStorage.setItem('theme',c);}
  </script>
</head>
<body>
  <header class="topnav">
    <a href="/" class="brand">Quizz</a>
    <nav class="nav-center">${navCenter}</nav>
    <div class="nav-right">${navRight}</div>
  </header>
  ${body}
  <footer class="footer">Quizz TKQTHT — Hệ thống trắc nghiệm trực tuyến</footer>
</body>
</html>`;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "ADMIN") {
    return res.status(403).send(layout("403", `<div class="container"><div class="card"><h1>403</h1><p>Bạn không có quyền truy cập trang này.</p><a href="/" class="btn btn-primary">Về trang chủ</a></div></div>`));
  }
  next();
}

app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", database: rows[0].ok === 1 ? "connected" : "unknown" });
  } catch (error) {
    res.status(500).json({ status: "error", database: "disconnected", message: error.message });
  }
});

/* ========== HOME / EXPLORE ========== */
app.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").trim(), tag = (req.query.tag || "").trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1), pageSize = 9;
    let where = "q.is_public=1", params = [];
    if (q) { where += " AND (q.title COLLATE utf8mb4_0900_ai_ci LIKE ? OR q.description COLLATE utf8mb4_0900_ai_ci LIKE ?)"; params.push("%"+q+"%", "%"+q+"%"); }
    if (tag) { where += " AND FIND_IN_SET(?, REPLACE(q.tags, ', ', ',')) > 0"; params.push(tag); }
    const [[count]] = await pool.query(`SELECT COUNT(*) total FROM quizzes q WHERE ${where}`, params);
    const total = Number(count.total), pages = Math.max(1, Math.ceil(total/pageSize)), safePage = Math.min(page,pages);
    const [quizzes] = await pool.query(`SELECT q.*,COUNT(DISTINCT qu.id) question_count,COUNT(DISTINCT a.id) attempt_count,u.full_name author
      FROM quizzes q LEFT JOIN questions qu ON qu.quiz_id=q.id LEFT JOIN attempts a ON a.quiz_id=q.id
      LEFT JOIN users u ON u.id=q.created_by WHERE ${where} GROUP BY q.id ORDER BY q.id DESC LIMIT ? OFFSET ?`,
      [...params,pageSize,(safePage-1)*pageSize]);
    const cards = quizzes.map(qz => `<article class="quiz-card">
      <h3><a href="/quiz/${qz.id}">${esc(qz.title)}</a></h3><p class="desc">${esc(qz.description || "")}</p>
      <div class="tag-row">${parseTags(qz.tags).map(t=>`<a class="tag-chip" href="/?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>
      <div class="quiz-meta"><span>${qz.question_count||0} câu</span><span>${qz.attempt_count||0} lượt làm</span><span>⏱ ${qz.duration_minutes} phút</span></div>
      <div class="quiz-foot">bởi ${esc(qz.author||"Hệ thống")} · ${qz.created_at?new Date(qz.created_at).toLocaleDateString("vi-VN"):""}</div>
      <a href="/quiz/${qz.id}" class="btn btn-primary btn-sm">Xem đề thi →</a></article>`).join("") || '<p class="empty">Không tìm thấy đề thi phù hợp.</p>';
    const qs = new URLSearchParams(); if(q)qs.set("q",q);if(tag)qs.set("tag",tag);
    const pagination = Array.from({length:pages},(_,i)=>i+1).filter(n=>n===1||n===pages||Math.abs(n-safePage)<=1)
      .map(n=>n===safePage?`<span class="current">${n}</span>`:`<a href="/?${qs.toString()}&page=${n}">${n}</a>`).join("");
    const tagLinks = ['Tất cả',...PREDEFINED_TAGS].map(t=>{const val=t==='Tất cả'?'':t;return `<a href="/?${q?'q='+encodeURIComponent(q)+'&':''}${val?'tag='+encodeURIComponent(val):''}" style="${tag===val?'background:var(--primary);color:white':''}">${esc(t)}</a>`}).join("");
    const body = `<div class="container"><section class="hero-banner"><h1>Khám phá đề thi, học theo cách của bạn</h1>
      <p>Tìm đề theo tên, nội dung hoặc chủ đề. Tìm kiếm không phân biệt dấu tiếng Việt.</p>
      <form class="search-row" id="searchForm" method="get" action="/"><input id="quizSearch" name="q" value="${esc(q)}" placeholder="Ví dụ: mang may tinh, Docker, bao mat..." autocomplete="off"><input type="hidden" name="tag" value="${esc(tag)}"><button type="submit">Tìm</button></form>
      </section><div class="section-head"><h2>Chủ đề đề thi</h2><span class="count">Chọn tag để lọc</span></div>
      <div class="tag-filter">${tagLinks}</div><div class="section-head"><h2>Danh sách đề thi</h2><span class="count" id="resultCount">${total} đề · trang ${safePage}/${pages}</span></div>
      <div class="quiz-grid" id="quizGrid">${cards}</div><nav class="pagination">${pagination}</nav></div>
      <script>(function(){const i=document.getElementById('quizSearch'),g=document.getElementById('quizGrid'),f=document.getElementById('searchForm'),p=document.querySelector('.pagination'),count=document.getElementById('resultCount');let t=0,seq=0,currentPage=1;function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}function drawPages(d){p.innerHTML='';if(d.pages<=1)return;const ns=[];for(let n=1;n<=d.pages;n++)if(n===1||n===d.pages||Math.abs(n-d.page)<=1)ns.push(n);const base=new URLSearchParams();if(i.value.trim())base.set('q',i.value.trim());const tag=f.querySelector('[name=tag]').value;if(tag)base.set('tag',tag);ns.forEach(n=>{if(n===d.page)p.insertAdjacentHTML('beforeend','<span class="current" aria-current="page">'+n+'</span>');else{const u=new URLSearchParams(base);u.set('page',n);p.insertAdjacentHTML('beforeend','<a href="/?'+u.toString()+'" data-page="'+n+'">'+n+'</a>');}});}async function run(page=1){const id=++seq;currentPage=page;try{const u=new URLSearchParams({q:i.value.trim(),tag:f.querySelector('[name=tag]').value,page:String(page)});const r=await fetch('/api/quizzes?'+u);if(!r.ok)throw new Error('Request failed');const d=await r.json();if(id!==seq)return;currentPage=d.page;g.innerHTML=d.items.length?d.items.map(q=>'<article class="quiz-card"><h3><a href="/quiz/'+q.id+'">'+esc(q.title)+'</a></h3><p class="desc">'+esc(q.description||'')+'</p><div class="tag-row">'+q.tags.map(t=>'<a class="tag-chip" href="/?tag='+encodeURIComponent(t)+'">'+esc(t)+'</a>').join('')+'</div><div class="quiz-meta"><span>'+q.question_count+' câu</span><span>'+q.attempt_count+' lượt làm</span><span>⏱ '+q.duration_minutes+' phút</span></div><a href="/quiz/'+q.id+'" class="btn btn-primary btn-sm">Xem đề thi →</a></article>').join(''):'<p class="empty">Không tìm thấy đề phù hợp.</p>';count.textContent=d.total+' đề thi · trang '+d.page+'/'+d.pages;drawPages(d);const u2=new URLSearchParams();if(i.value.trim())u2.set('q',i.value.trim());if(f.querySelector('[name=tag]').value)u2.set('tag',f.querySelector('[name=tag]').value);if(page>1)u2.set('page',page);history.replaceState(null,'','/?'+u2.toString());}catch(e){if(id===seq)g.innerHTML='<p class="empty">Không thể tìm đề thi lúc này.</p>';}}p.addEventListener('click',e=>{const a=e.target.closest('a[data-page]');if(a){e.preventDefault();run(Number(a.dataset.page));}});i.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>run(1),220);});f.querySelector('[name=tag]').addEventListener('change',()=>run(1));f.addEventListener('submit',e=>{e.preventDefault();run(1);});})();</script>`;
    res.send(layout("Khám phá đề thi", body, req.session.user, "home"));
  } catch (e) { console.error(e); res.status(500).send(layout("Lỗi", '<div class="container"><p>Không tải được dữ liệu.</p></div>', req.session.user)); }
});
app.get("/quizzes", (req, res) => res.redirect("/"));

/* ========== AUTH ========== */
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  const err = req.query.error ? `<div class="alert alert-error">${esc(req.query.error)}</div>` : "";
  const body = `
    <div class="container">
      <div class="card form-card">
        <h1>Đăng nhập</h1>
        <p class="muted">Dùng tên đăng nhập hoặc email</p>
        ${err}
        <form method="post" action="/login">
          <input type="hidden" name="next" value="${esc(req.query.next || "/")}">
          <label>Tên đăng nhập hoặc Email</label>
          <input name="login" required placeholder="student hoặc student@example.com" autocomplete="username">
          <label>Mật khẩu</label>
          <input type="password" name="password" required placeholder="••••••••" autocomplete="current-password">
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">Đăng nhập</button>
          </div>
        </form>
        <p class="muted" style="margin-top:14px"><a href="/forgot-password">Quên mật khẩu?</a></p><p class="muted" style="margin-top:20px">Chưa có tài khoản? <a href="/register">Đăng ký</a></p>
        <p class="muted" style="font-size:.85rem">Đăng nhập bằng tài khoản đã được cấp hoặc tài khoản demo trong hướng dẫn triển khai.</p>
      </div>
    </div>`;
  res.send(layout("Đăng nhập", body));
});

app.post("/login", async (req, res) => {
  try {
    const login = (req.body.login || "").trim();
    const password = req.body.password || "";
    const next = req.body.next || "/";
    if (!login || !password) return res.redirect("/login?error=" + encodeURIComponent("Vui lòng nhập đầy đủ thông tin"));

    const [rows] = await pool.query(
      "SELECT id, full_name, username, email, password_hash, role FROM users WHERE username = ? OR email = ? LIMIT 1",
      [login, login]
    );
    if (!rows.length) return res.redirect("/login?error=" + encodeURIComponent("Tài khoản không tồn tại"));

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.redirect("/login?error=" + encodeURIComponent("Mật khẩu không đúng"));

    req.session.user = {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role
    };
    res.redirect(next.startsWith("/") ? next : "/");
  } catch (e) {
    res.redirect("/login?error=" + encodeURIComponent("Lỗi hệ thống, thử lại sau"));
  }
});

app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  const err = req.query.error ? `<div class="alert alert-error">${esc(req.query.error)}</div>` : "";
  const body = `
    <div class="container">
      <div class="card form-card">
        <h1>Đăng ký tài khoản</h1>
        <p class="muted">Tạo tài khoản học sinh. Email không bắt buộc, nhưng cần có nếu bạn muốn tự tạo quiz.</p>
        ${err}
        <form method="post" action="/register">
          <label>Họ và tên *</label>
          <input name="full_name" required placeholder="Nguyễn Văn A" autocomplete="name">
          <label>Tên đăng nhập *</label>
          <input name="username" required minlength="3" maxlength="80" pattern="[a-zA-Z0-9._-]+" placeholder="nguyenvana" autocomplete="username">
          <label>Mật khẩu *</label>
          <input type="password" name="password" required minlength="6" placeholder="Ít nhất 6 ký tự" autocomplete="new-password">
          <label>Email (tùy chọn)</label>
          <input type="email" name="email" placeholder="ban@email.com" autocomplete="email">
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">Tạo tài khoản</button>
          </div>
        </form>
        <p class="muted" style="margin-top:20px">Đã có tài khoản? <a href="/login">Đăng nhập</a></p>
      </div>
    </div>`;
  res.send(layout("Đăng ký", body));
});

app.post("/register", async (req, res) => {
  try {
    const full_name = (req.body.full_name || "").trim();
    const username = (req.body.username || "").trim().toLowerCase();
    const password = req.body.password || "";
    const email = (req.body.email || "").trim() || null;

    if (!full_name || !username || password.length < 6) {
      return res.redirect("/register?error=" + encodeURIComponent("Họ tên, tên đăng nhập và mật khẩu (≥6) là bắt buộc"));
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return res.redirect("/register?error=" + encodeURIComponent("Tên đăng nhập chỉ gồm chữ, số, . _ -"));
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (full_name, username, email, password_hash, role) VALUES (?,?,?,?, 'STUDENT')",
      [full_name, username, email, hash]
    );
    const [rows] = await pool.query("SELECT id, full_name, username, email, role FROM users WHERE username=?", [username]);
    req.session.user = rows[0];
    res.redirect("/");
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.redirect("/register?error=" + encodeURIComponent("Tên đăng nhập hoặc email đã được sử dụng"));
    }
    res.redirect("/register?error=" + encodeURIComponent("Không thể đăng ký, thử lại sau"));
  }
});

app.get("/forgot-password", (req,res) => {
  const msg=req.query.msg?`<div class="alert alert-ok">${esc(req.query.msg)}</div>`:"";
  const body=`<div class="container"><div class="card form-card"><h1>Quên mật khẩu</h1><p class="muted">Nhập email đã gắn với tài khoản. Nếu email tồn tại, hệ thống sẽ gửi liên kết đặt lại mật khẩu.</p>${msg}
    <form method="post" action="/forgot-password"><label>Email tài khoản</label><input type="email" name="email" required autocomplete="email"><div class="form-actions"><button class="btn btn-primary">Gửi liên kết</button></div></form><p><a href="/login">Quay lại đăng nhập</a></p></div></div>`;
  res.send(layout("Quên mật khẩu",body));
});
app.post("/forgot-password", async (req,res) => {
  const generic="Nếu email đã đăng ký và SMTP được cấu hình, liên kết đặt lại mật khẩu sẽ được gửi.";
  try {
    const email=(req.body.email||"").trim().toLowerCase();
    const [[u]]=await pool.query("SELECT id,email FROM users WHERE email=? LIMIT 1",[email]);
    if(u && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const raw=crypto.randomBytes(32).toString("hex"), hash=crypto.createHash("sha256").update(raw).digest("hex");
      await pool.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=? AND used_at IS NULL",[u.id]);
      await pool.query("INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))",[u.id,hash]);
      const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||"false")==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
      const base=(process.env.APP_BASE_URL||"https://localhost").replace(/\/$/,"");
      await transport.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:email,subject:"Đặt lại mật khẩu Quiz",text:`Bạn vừa yêu cầu đặt lại mật khẩu. Liên kết có hiệu lực trong 30 phút: ${base}/reset-password/${raw}\nNếu không phải bạn, hãy bỏ qua email này.`});
    }
    res.redirect("/forgot-password?msg="+encodeURIComponent(generic));
  } catch(e){console.error("Password reset email error:",e);res.redirect("/forgot-password?msg="+encodeURIComponent(generic));}
});
app.get("/reset-password/:token", async (req,res) => {
  const hash=crypto.createHash("sha256").update(req.params.token).digest("hex");
  const [[row]]=await pool.query("SELECT id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW()",[hash]);
  if(!row)return res.status(400).send(layout("Liên kết không hợp lệ",'<div class="container"><div class="card"><h1>Liên kết hết hạn hoặc không hợp lệ</h1><a href="/forgot-password">Yêu cầu liên kết mới</a></div></div>'));
  const body=`<div class="container"><div class="card form-card"><h1>Đặt mật khẩu mới</h1><form method="post" action="/reset-password/${esc(req.params.token)}"><label>Mật khẩu mới (ít nhất 8 ký tự)</label><input type="password" name="password" required minlength="8" autocomplete="new-password"><label>Nhập lại mật khẩu</label><input type="password" name="confirm" required minlength="8" autocomplete="new-password"><div class="form-actions"><button class="btn btn-primary">Đổi mật khẩu</button></div></form></div></div>`;
  res.send(layout("Đặt lại mật khẩu",body));
});
app.post("/reset-password/:token", async (req,res) => {
  try {
    const password=req.body.password||"", confirm=req.body.confirm||"";
    if(password.length<8||password!==confirm)return res.status(400).send(layout("Lỗi",'<div class="container"><div class="card"><p>Mật khẩu phải từ 8 ký tự và hai ô phải khớp.</p><a href="javascript:history.back()">Quay lại</a></div></div>'));
    const hash=crypto.createHash("sha256").update(req.params.token).digest("hex");
    const [[row]]=await pool.query("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW()",[hash]);
    if(!row)return res.status(400).send(layout("Liên kết không hợp lệ",'<div class="container"><div class="card"><p>Liên kết hết hạn hoặc đã sử dụng.</p><a href="/forgot-password">Yêu cầu liên kết mới</a></div></div>'));
    await pool.query("UPDATE users SET password_hash=? WHERE id=?",[await bcrypt.hash(password,12),row.user_id]);
    await pool.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE id=?",[row.id]);
    res.redirect("/login?error="+encodeURIComponent("Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới."));
  } catch(e){console.error(e);res.status(500).send(layout("Lỗi",'<div class="container"><p>Không thể đặt lại mật khẩu.</p></div>'));}
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});


/* ===== ACCOUNT: thêm/đổi email ===== */
app.get("/account", requireLogin, async (req, res) => {
  const [[u]] = await pool.query("SELECT id, full_name, username, email, role, created_at FROM users WHERE id=?", [req.session.user.id]);
  const msg = req.query.msg ? `<div class="alert alert-ok">${esc(req.query.msg)}</div>` : "";
  const err = req.query.error ? `<div class="alert alert-error">${esc(req.query.error)}</div>` : "";
  const body = `<div class="container" style="max-width:640px">
    <h1 style="margin:24px 0 12px">Tài khoản</h1>${msg}${err}
    <div class="card">
      <p><b>Họ tên:</b> ${esc(u.full_name)}</p>
      <p><b>Username:</b> ${esc(u.username)}</p>
      <p><b>Vai trò:</b> <span class="chip">${u.role}</span></p>
      <p><b>Email:</b> ${u.email ? esc(u.email) : '<span class="muted">(chưa có — thêm bên dưới để tạo quiz riêng)</span>'}</p>
      <p class="muted" style="font-size:.9rem">Ngày tạo: ${new Date(u.created_at).toLocaleString("vi-VN")}</p>
    </div>
    <div class="card">
      <h2 style="margin-top:0">${u.email ? "Đổi email" : "Thêm email"}</h2>
      <p class="muted">Email cần thiết để <b>tự tạo quiz</b>. Mỗi email chỉ gắn một tài khoản.</p>
      <form method="post" action="/account/email">
        <label>Địa chỉ email</label>
        <input type="email" name="email" required value="${esc(u.email || "")}" placeholder="ban@email.com">
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">${u.email ? "Cập nhật email" : "Thêm email"}</button>
        </div>
      </form>
      ${u.email ? `<form method="post" action="/account/email/remove" style="margin-top:10px" onsubmit="return confirm('Gỡ email?')">
        <button class="btn btn-ghost btn-sm" type="submit">Gỡ email</button></form>` : ""}
    </div>
    <div class="card">
      <h2 style="margin-top:0">Đổi mật khẩu</h2>
      <form method="post" action="/account/password">
        <label>Mật khẩu hiện tại</label>
        <input type="password" name="current" required autocomplete="current-password">
        <label>Mật khẩu mới (≥6)</label>
        <input type="password" name="password" required minlength="6" autocomplete="new-password">
        <div class="form-actions"><button class="btn btn-primary" type="submit">Đổi mật khẩu</button></div>
      </form>
    </div>
  </div>`;
  res.send(layout("Tài khoản", body, req.session.user));
});

app.post("/account/email", requireLogin, async (req, res) => {
  try {
    const email = (req.body.email || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.redirect("/account?error=" + encodeURIComponent("Email không hợp lệ"));
    await pool.query("UPDATE users SET email=? WHERE id=?", [email, req.session.user.id]);
    req.session.user.email = email;
    res.redirect("/account?msg=" + encodeURIComponent("Đã cập nhật email"));
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res.redirect("/account?error=" + encodeURIComponent("Email đã được dùng"));
    res.redirect("/account?error=" + encodeURIComponent("Không cập nhật được"));
  }
});

app.post("/account/email/remove", requireLogin, async (req, res) => {
  await pool.query("UPDATE users SET email=NULL WHERE id=?", [req.session.user.id]);
  req.session.user.email = null;
  res.redirect("/account?msg=" + encodeURIComponent("Đã gỡ email"));
});

app.post("/account/password", requireLogin, async (req, res) => {
  try {
    const [[u]] = await pool.query("SELECT password_hash FROM users WHERE id=?", [req.session.user.id]);
    if (!(await bcrypt.compare(req.body.current || "", u.password_hash)))
      return res.redirect("/account?error=" + encodeURIComponent("Mật khẩu hiện tại sai"));
    if ((req.body.password || "").length < 6)
      return res.redirect("/account?error=" + encodeURIComponent("Mật khẩu mới quá ngắn"));
    await pool.query("UPDATE users SET password_hash=? WHERE id=?", [await bcrypt.hash(req.body.password, 10), req.session.user.id]);
    res.redirect("/account?msg=" + encodeURIComponent("Đã đổi mật khẩu"));
  } catch (e) {
    res.redirect("/account?error=" + encodeURIComponent("Lỗi đổi mật khẩu"));
  }
});



/* ========== QUIZZES LIST ========== */
app.get("/quizzes", async (req, res) => {
  try {
    const [quizzes] = await pool.query(`
      SELECT q.id, q.title, q.description, q.duration_minutes, q.created_at,
             COUNT(DISTINCT qu.id) AS question_count,
             u.full_name AS author
      FROM quizzes q
      LEFT JOIN questions qu ON qu.quiz_id = q.id
      LEFT JOIN users u ON u.id = q.created_by
      WHERE q.is_public = 1
      GROUP BY q.id
      ORDER BY q.id DESC
    `);
    const cards = quizzes.map(q => `
      <div class="card quiz-card">
        <h2>${esc(q.title)}</h2>
        <p>${esc(q.description || "Không có mô tả")}</p>
        <div class="meta">
          <span class="badge">📝 ${q.question_count} câu</span>
          <span class="badge">⏱ ${q.duration_minutes} phút</span>
          ${q.author ? `<span class="badge">👤 ${esc(q.author)}</span>` : ""}
        </div>
        <a href="/quiz/${q.id}" class="btn btn-primary btn-sm">Xem &amp; làm bài →</a>
      </div>`).join("");
    const body = `
      <div class="container">
        <h1 class="section-title">Danh sách đề thi</h1>
        <p class="muted">Chọn một đề để xem chi tiết và bắt đầu làm bài (cần đăng nhập).</p>
        <div class="quiz-grid">${cards || '<p class="empty">Chưa có đề thi công khai.</p>'}</div>
      </div>`;
    res.send(layout("Đề thi", body, req.session.user));
  } catch (e) {
    res.status(500).send(layout("Lỗi", `<div class="container"><p>Không tải được danh sách đề.</p></div>`, req.session.user));
  }
});

/* ========== TAKE QUIZ ========== */
app.get("/quiz/:id", async (req, res) => {
  try {
    const [[quiz]] = await pool.query(
      `SELECT q.*, u.full_name AS author FROM quizzes q LEFT JOIN users u ON u.id=q.created_by WHERE q.id=?`,
      [req.params.id]
    );
    if (!quiz) return res.status(404).send(layout("404", `<div class="container"><h1>Không tìm thấy đề.</h1></div>`, req.session.user));

    let [questions] = await pool.query("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", [quiz.id]);
    let answers = [];
    if (questions.length) {
      const ids = questions.map(q => q.id);
      [answers] = await pool.query(
        `SELECT * FROM answers WHERE question_id IN (${ids.map(() => "?").join(",")}) ORDER BY sort_order, id`,
        ids
      );
    }
    const byQuestion = {};
    answers.forEach(a => (byQuestion[a.question_id] ??= []).push(a));

    // Detail page (not playing)
    if (req.query.play !== "1") {
      const body = `<div class="container"><div class="detail-layout"><div class="card">
        <h1 style="margin-top:0">${esc(quiz.title)}</h1>
        <p class="muted">${esc(quiz.description || "")}</p>
        <div class="quiz-meta" style="margin:12px 0">
          <span class="chip">${questions.length} câu</span>
          <span class="chip">⏱ ${quiz.duration_minutes} phút</span>
          ${quiz.shuffle_questions ? '<span class="chip">🔀 Trộn câu</span>' : ''}
          ${quiz.shuffle_answers ? '<span class="chip">🔀 Trộn đáp án</span>' : ''}
        </div>
        ${req.session.user
          ? `<a href="/quiz/${quiz.id}?play=1" class="btn btn-success">▶ Bắt đầu làm bài</a>`
          : `<a href="/login?next=/quiz/${quiz.id}?play=1" class="btn btn-success">Đăng nhập để làm bài</a>`}
      </div>
      <aside><div class="card side-meta"><dl>
        <dt>Người tạo</dt><dd>${esc(quiz.author || "Hệ thống")}</dd>
        <dt>Ngày đăng</dt><dd>${new Date(quiz.created_at).toLocaleDateString("vi-VN")}</dd>
      </dl></div></aside></div></div>`;
      return res.send(layout(quiz.title, body, req.session.user, "explore"));
    }

    if (!req.session.user) return res.redirect("/login?next=/quiz/" + quiz.id + "?play=1");

    // Shuffle per attempt
    if (quiz.shuffle_questions) questions = shuffle(questions);

    function renderAnswers(q, opts) {
      const t = q.qtype || "single";
      if (t === "fill") {
        return `<input name="q_${q.id}" placeholder="Nhập đáp án..." required autocomplete="off">`;
      }
      if (t === "multiple") {
        return opts.map(a => `<label class="answer-option"><input type="checkbox" name="q_${q.id}" value="${a.id}"> ${esc(a.content)}</label>`).join("");
      }
      if (t === "order") {
        const items = quiz.shuffle_answers ? shuffle(opts) : opts.slice().sort((a,b)=>a.sort_order-b.sort_order);
        return `<ul class="order-list">${items.map((a,i) => `<li>
          <input type="number" name="ord_${q.id}_${a.id}" min="1" max="${items.length}" value="${i+1}" required>
          <span>${esc(a.content)}</span>
        </li>`).join("")}</ul>
        <p class="muted" style="font-size:.85rem">Nhập số thứ tự (1 = đầu tiên).</p>`;
      }
      if (t === "match") {
        const left = opts.filter(a => a.sort_order < 10);
        const right = opts.filter(a => a.sort_order >= 10);
        const rightShuf = quiz.shuffle_answers ? shuffle(right) : right;
        return left.map(L => `<div class="match-row">
          <div><b>${esc(L.content)}</b></div>
          <select name="match_${q.id}_${L.id}" required>
            <option value="">— Chọn —</option>
            ${rightShuf.map(R => `<option value="${R.pair_key || R.id}">${esc(R.content)}</option>`).join("")}
          </select>
        </div>`).join("");
      }
      // single / truefalse
      const list = (t !== "truefalse" && quiz.shuffle_answers) ? shuffle(opts) : opts;
      return list.map(a => `<label class="answer-option"><input type="radio" name="q_${q.id}" value="${a.id}" required> ${esc(a.content)}</label>`).join("");
    }

    const form = questions.map((q, i) => {
      let opts = byQuestion[q.id] || [];
      const t = q.qtype || "single";
      return `<div class="card q-card">
        <h3>Câu ${i + 1}. ${esc(q.content)} <span class="qtype-badge">${QTYPE_LABEL[t] || t}</span></h3>
        ${renderAnswers(q, opts)}
      </div>`;
    }).join("");

    const body = `<div class="container">
      <h1>${esc(quiz.title)}</h1>
      <div class="timer-bar"><span>⏱ Còn lại: <strong id="timer">${quiz.duration_minutes}:00</strong></span>
        <span class="muted">${questions.length} câu${quiz.shuffle_questions ? " · đã trộn" : ""}</span></div>
      <form method="post" action="/quiz/${quiz.id}/submit" id="quizForm">
        ${form || '<p class="empty">Chưa có câu hỏi.</p>'}
        ${questions.length ? '<button type="submit" class="btn btn-primary">Nộp bài</button>' : ""}
      </form>
    </div>
    <script>(function(){var total=${Number(quiz.duration_minutes)*60};var el=document.getElementById('timer');var form=document.getElementById('quizForm');
    setInterval(function(){total--;if(total<0){if(form)form.submit();return;}var m=Math.floor(total/60),s=total%60;
    el.textContent=m+':'+(s<10?'0':'')+s;if(total<=60)el.className='timer-danger';else if(total<=180)el.className='timer-warn';},1000);})();</script>`;
    res.send(layout(quiz.title, body, req.session.user, "explore"));
  } catch (e) {
    res.status(500).send(layout("Lỗi", `<div class="container"><p>Không tải được đề: ${esc(e.message)}</p></div>`, req.session.user));
  }
});

app.post("/quiz/:id/submit", requireLogin, async (req, res) => {
  try {
    const [[quiz]] = await pool.query("SELECT * FROM quizzes WHERE id=?", [req.params.id]);
    if (!quiz) return res.status(404).send("Quiz not found");
    const [questions] = await pool.query("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", [quiz.id]);
    let correct = 0;
    for (const q of questions) {
      const t = q.qtype || "single";
      const [opts] = await pool.query("SELECT * FROM answers WHERE question_id=? ORDER BY sort_order, id", [q.id]);
      let ok = false;
      if (t === "fill") {
        const ans = String(req.body[`q_${q.id}`] || "").trim().toLowerCase();
        const correctTexts = opts.filter(a => Number(a.is_correct) === 1).map(a => a.content.trim().toLowerCase());
        ok = correctTexts.includes(ans);
      } else if (t === "multiple") {
        let selected = req.body[`q_${q.id}`];
        if (!selected) selected = [];
        if (!Array.isArray(selected)) selected = [selected];
        const sel = selected.map(Number).sort((a,b)=>a-b);
        const need = opts.filter(a => Number(a.is_correct) === 1).map(a => a.id).sort((a,b)=>a-b);
        ok = sel.length === need.length && sel.every((v,i) => v === need[i]);
      } else if (t === "order") {
        const ordered = opts.slice().sort((a,b) => a.sort_order - b.sort_order);
        ok = ordered.every((a, i) => Number(req.body[`ord_${q.id}_${a.id}`]) === i + 1);
      } else if (t === "match") {
        const left = opts.filter(a => a.sort_order < 10);
        ok = left.every(L => String(req.body[`match_${q.id}_${L.id}`] || "") === String(L.pair_key || ""));
      } else {
        // single / truefalse
        const selected = req.body[`q_${q.id}`];
        if (selected) {
          const [[answer]] = await pool.query("SELECT is_correct FROM answers WHERE id=? AND question_id=?", [selected, q.id]);
          ok = answer && Number(answer.is_correct) === 1;
        }
      }
      if (ok) correct++;
    }
    const total = questions.length;
    const score = total ? Math.round((correct / total * 10) * 100) / 100 : 0;
    const [result] = await pool.query(
      "INSERT INTO attempts (quiz_id, user_id, score, correct_count, total_questions) VALUES (?,?,?,?,?)",
      [quiz.id, req.session.user.id, score, correct, total]
    );
    res.redirect(`/result/${result.insertId}`);
  } catch (e) {
    res.status(500).send(layout("Lỗi", `<div class="container"><p>Không nộp được bài: ${esc(e.message)}</p></div>`, req.session.user));
  }
});

app.get("/result/:id", requireLogin, async (req, res) => {
  try {
    const [[a]] = await pool.query(
      `SELECT a.*, q.title FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.id=? AND a.user_id=?`,
      [req.params.id, req.session.user.id]
    );
    if (!a) return res.status(404).send(layout("404", `<div class="container"><h1>Không tìm thấy kết quả.</h1></div>`, req.session.user));

    // Leaderboard top 5
    const [top] = await pool.query(
      `SELECT u.full_name, a.score, a.submitted_at FROM attempts a
       JOIN users u ON u.id = a.user_id WHERE a.quiz_id=? ORDER BY a.score DESC, a.submitted_at ASC LIMIT 5`,
      [a.quiz_id]
    );

    const body = `
      <div class="container">
        <div class="card" style="text-align:center">
          <h1>Kết quả bài thi</h1>
          <h2>${esc(a.title)}</h2>
          <p class="score-big">${a.score}/10</p>
          <p class="muted">Đúng ${a.correct_count || "?"} / ${a.total_questions || "?"} câu · ${new Date(a.submitted_at).toLocaleString("vi-VN")}</p>
          <div class="form-actions" style="justify-content:center">
            <a href="/history" class="btn btn-primary">Xem lịch sử</a>
            <a href="/quizzes" class="btn btn-ghost">Làm đề khác</a>
          </div>
        </div>
        <h2 class="section-title">Bảng xếp hạng (top 5)</h2>
        <div class="card">
          <table>
            <tr><th>#</th><th>Họ tên</th><th>Điểm</th><th>Thời gian</th></tr>
            ${top.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.full_name)}</td><td><b>${r.score}/10</b></td><td>${new Date(r.submitted_at).toLocaleString("vi-VN")}</td></tr>`).join("") || "<tr><td colspan=4>Chưa có dữ liệu</td></tr>"}
          </table>
        </div>
      </div>`;
    res.send(layout("Kết quả", body, req.session.user));
  } catch (e) {
    res.status(500).send(layout("Lỗi", `<div class="container"><p>Lỗi tải kết quả.</p></div>`, req.session.user));
  }
});

app.get("/history", requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, q.title, a.score, a.correct_count, a.total_questions, a.submitted_at
       FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.user_id=? ORDER BY a.submitted_at DESC`,
      [req.session.user.id]
    );
    const body = `
      <div class="container">
        <h1 class="section-title">Lịch sử làm bài</h1>
        <div class="card">
          ${rows.length ? `
          <table>
            <tr><th>Đề thi</th><th>Điểm</th><th>Chi tiết</th><th>Thời gian</th><th></th></tr>
            ${rows.map(r => `
              <tr>
                <td>${esc(r.title)}</td>
                <td><b>${r.score}/10</b></td>
                <td>${r.correct_count != null ? r.correct_count + "/" + r.total_questions + " câu" : "—"}</td>
                <td>${new Date(r.submitted_at).toLocaleString("vi-VN")}</td>
                <td><a href="/result/${r.id}">Xem</a></td>
              </tr>`).join("")}
          </table>` : '<p class="empty">Bạn chưa làm bài nào.</p>'}
        </div>
      </div>`;
    res.send(layout("Lịch sử", body, req.session.user));
  } catch (e) {
    res.status(500).send(layout("Lỗi", `<div class="container"><p>Không tải lịch sử.</p></div>`, req.session.user));
  }
});

/* ========== STUDENT: MY QUIZZES (cần email) ========== */
app.get("/my-quizzes", requireLogin, async (req, res) => {
  if (!req.session.user.email) {
    return res.send(layout("Quiz của tôi", `
      <div class="container">
        <div class="card">
          <h1>Tạo quiz riêng</h1>
          <p>Bạn cần có <strong>email</strong> trên tài khoản để tạo và quản lý quiz của riêng mình.</p>
          <p class="muted">Hiện tại tài khoản của bạn chưa có email. Liên hệ admin hoặc đăng ký lại với email.</p>
          <a href="/" class="btn btn-ghost">Về trang chủ</a>
        </div>
      </div>`, req.session.user));
  }
  const [quizzes] = await pool.query(
    `SELECT q.*, COUNT(DISTINCT qu.id) AS question_count FROM quizzes q
     LEFT JOIN questions qu ON qu.quiz_id = q.id
     WHERE q.created_by=? GROUP BY q.id ORDER BY q.id DESC`,
    [req.session.user.id]
  );
  const body = `
    <div class="container">
      <h1 class="section-title">Quiz của tôi</h1>
      <p><a href="/my-quizzes/new" class="btn btn-primary">+ Tạo đề mới</a></p>
      <div class="quiz-grid">
        ${quizzes.map(q => `
          <div class="card quiz-card">
            <h2>${esc(q.title)}</h2>
            <p>${esc(q.description || "")}</p>
            <div class="meta">
              <span class="badge">${q.question_count} câu</span>
              <span class="badge">${q.duration_minutes} phút</span>
              <span class="badge">${q.is_public ? "Công khai" : "Riêng tư"}</span>
            </div>
            <a href="/admin/quizzes/${q.id}" class="btn btn-sm btn-ghost">Chỉnh sửa</a>
            <form method="post" action="/my-quizzes/${q.id}/delete" style="display:inline;margin-left:6px" onsubmit="return confirm('Xóa đề này vĩnh viễn?')">
              <button type="submit" class="btn btn-danger btn-sm">Xóa</button>
            </form>
          </div>`).join("") || '<p class="empty">Bạn chưa tạo đề nào.</p>'}
      </div>
    </div>`;
  res.send(layout("Quiz của tôi", body, req.session.user));
});

app.get("/my-quizzes/new", requireLogin, (req, res) => {
  if (!req.session.user.email) return res.redirect("/my-quizzes");
  const body = `
    <div class="container">
      <div class="card form-card" style="max-width:560px">
        <h1>Tạo đề thi mới</h1>
        <form method="post" action="/my-quizzes">
          <label>Tên đề *</label>
          <input name="title" required>
          <label>Mô tả</label>
          <textarea name="description" rows="3"></textarea>
          <label>Thời gian (phút)</label>
          <input type="number" name="duration_minutes" value="30" min="1" max="300">
          <label>Tag chủ đề (chọn nhiều)</label>
          ${tagsInput()}
          <label><input type="checkbox" name="is_public" value="1" checked style="width:auto"> Công khai (hiện trong danh sách đề)</label>
          <label><input type="checkbox" name="shuffle_questions" value="1" style="width:auto"> Trộn thứ tự câu hỏi mỗi lượt làm</label>
          <label><input type="checkbox" name="shuffle_answers" value="1" style="width:auto"> Trộn thứ tự đáp án</label>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">Tạo đề</button>
            <a href="/my-quizzes" class="btn btn-ghost">Hủy</a>
          </div>
        </form>
      </div>
    </div>`;
  res.send(layout("Tạo đề", body, req.session.user));
});

app.post("/my-quizzes", requireLogin, async (req, res) => {
  if (!req.session.user.email) return res.redirect("/my-quizzes");
  const [r] = await pool.query(
    "INSERT INTO quizzes (title, description, duration_minutes, created_by, is_public, shuffle_questions, shuffle_answers, tags) VALUES (?,?,?,?,?,?,?,?)",
    [req.body.title, req.body.description || "", Number(req.body.duration_minutes) || 30, req.session.user.id, req.body.is_public ? 1 : 0, req.body.shuffle_questions ? 1 : 0, req.body.shuffle_answers ? 1 : 0, (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags ? [req.body.tags] : []).join(", ")]
  );
  res.redirect(`/admin/quizzes/${r.insertId}`);
});


app.post("/my-quizzes/:id/delete", requireLogin, async (req, res) => {
  const [[quiz]] = await pool.query("SELECT * FROM quizzes WHERE id=?", [req.params.id]);
  if (!quiz) return res.redirect("/my-quizzes");
  const isOwner = quiz.created_by === req.session.user.id;
  const isAdmin = req.session.user.role === "ADMIN";
  if (!isOwner && !isAdmin) return res.status(403).send(layout("403", `<div class="container"><h1>Không có quyền xóa đề này.</h1></div>`, req.session.user));
  await pool.query("DELETE FROM attempts WHERE quiz_id=?", [req.params.id]);
  await pool.query("DELETE FROM quizzes WHERE id=?", [req.params.id]);
  if (isAdmin && !isOwner) return res.redirect("/admin/quizzes");
  res.redirect("/my-quizzes");
});


/* ========== ADMIN ========== */
app.get("/admin", requireAdmin, async (req, res) => {
  const [[s]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM quizzes) AS quizzes,
      (SELECT COUNT(*) FROM questions) AS questions,
      (SELECT COUNT(*) FROM attempts) AS attempts
  `);
  const body = `
    <div class="container">
      <h1 class="section-title">Bảng điều khiển quản trị</h1>
      <div class="stats-row">
        <div class="stat-box"><div class="num">${s.users}</div><div class="lbl">Thành viên</div></div>
        <div class="stat-box"><div class="num">${s.quizzes}</div><div class="lbl">Đề thi</div></div>
        <div class="stat-box"><div class="num">${s.questions}</div><div class="lbl">Câu hỏi</div></div>
        <div class="stat-box"><div class="num">${s.attempts}</div><div class="lbl">Lượt làm</div></div>
      </div>
      <div class="features">
        <a href="/admin/quizzes" class="feature-card" style="color:inherit;text-decoration:none">
          <div class="icon">📋</div><h3>Quản lý đề thi</h3><p>Tạo, sửa, xóa đề và câu hỏi.</p>
        </a>
        <a href="/admin/users" class="feature-card" style="color:inherit;text-decoration:none">
          <div class="icon">👥</div><h3>Quản lý thành viên</h3><p>Xem danh sách, đổi vai trò, xóa tài khoản.</p>
        </a>
      </div>
    </div>`;
  res.send(layout("Quản trị", body, req.session.user));
});

app.get("/admin/users", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const role = ["ADMIN", "STUDENT"].includes(String(req.query.role || "").toUpperCase()) ? String(req.query.role).toUpperCase() : "";
  const pageSize = 10;
  const requestedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
  const clauses = [], params = [];
  if (q) { clauses.push(`(CAST(id AS CHAR) LIKE ? OR full_name LIKE ? OR username LIKE ? OR email LIKE ? OR role LIKE ?)`); const pattern = `%${q}%`; params.push(pattern, pattern, pattern, pattern, pattern); }
  if (role) { clauses.push("role = ?"); params.push(role); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);
  const total = Number(countRow.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const [users] = await pool.query(
    `SELECT id, full_name, username, email, role, created_at FROM users ${where} ORDER BY id LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const msg = req.query.msg ? `<div class="alert alert-ok">${esc(req.query.msg)}</div>` : "";
  const pagination = (totalPages > 1) ? `<nav class="pagination" aria-label="Phân trang">
    ${page > 1 ? `<a class="btn btn-ghost btn-sm" href="/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&page=${page-1}">← Trước</a>` : `<span class="btn btn-ghost btn-sm disabled">← Trước</span>`}
    <span class="page-info">Trang <strong>${page}</strong> / ${totalPages}</span>
    ${page < totalPages ? `<a class="btn btn-ghost btn-sm" href="/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&page=${page+1}">Sau →</a>` : `<span class="btn btn-ghost btn-sm disabled">Sau →</span>`}
  </nav>` : "";
  const body = `
    <div class="container admin-list-page">
      <h1 class="section-title">Quản lý thành viên</h1>
      ${msg}
      <div class="card">
        <form class="admin-search" method="get" action="/admin/users">
          <input name="q" value="${esc(q)}" placeholder="Tìm theo ID, họ tên, username hoặc email..." aria-label="Tìm thành viên">
          <select name="role" aria-label="Lọc theo vai trò"><option value="">Tất cả thành viên</option><option value="ADMIN" ${role === "ADMIN" ? "selected" : ""}>Chỉ quản trị viên (Admin)</option><option value="STUDENT" ${role === "STUDENT" ? "selected" : ""}>Chỉ học sinh/thành viên</option></select>
          <button class="btn btn-primary" type="submit">Lọc / tìm kiếm</button>
          ${q || role ? `<a class="btn btn-ghost" href="/admin/users">Xóa lọc</a>` : ""}
        </form>
        <p class="muted result-count">${total ? `Tìm thấy ${total} thành viên · Hiển thị ${offset + 1}–${Math.min(offset + users.length, total)}` : "Không tìm thấy thành viên phù hợp."}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>ID</th><th>Họ tên</th><th>Username</th><th>Email</th><th>Vai trò</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
          <tbody>${users.map(u => `
            <tr>
              <td>${u.id}</td><td>${esc(u.full_name)}</td><td>${esc(u.username)}</td><td>${esc(u.email || "—")}</td>
              <td><span class="badge">${esc(u.role)}</span></td><td>${new Date(u.created_at).toLocaleDateString("vi-VN")}</td>
              <td>${u.id !== req.session.user.id ? `
                <div class="admin-actions"><form method="post" action="/admin/users/${u.id}/role">
                  <select name="role" aria-label="Vai trò thành viên ${esc(u.username)}" onchange="this.form.submit()">
                    <option value="STUDENT" ${u.role === "STUDENT" ? "selected" : ""}>STUDENT</option>
                    <option value="ADMIN" ${u.role === "ADMIN" ? "selected" : ""}>ADMIN</option>
                  </select>
                </form><form method="post" action="/admin/users/${u.id}/delete" onsubmit="return confirm('Xóa tài khoản này?')">
                  <input type="hidden" name="return_q" value="${esc(q)}"><input type="hidden" name="return_role" value="${esc(role)}"><input type="hidden" name="return_page" value="${page}">
                  <button class="btn btn-danger btn-sm" type="submit">Xóa</button>
                </form></div>` : '<span class="muted">(bạn)</span>'}</td>
            </tr>`).join("") || `<tr><td colspan="7" class="empty">Không có dữ liệu.</td></tr>`}</tbody>
        </table></div>
        ${pagination}
      </div>
      <p style="margin-top:16px"><a href="/admin" class="btn btn-ghost">← Quay lại</a></p>
    </div>`;
  res.send(layout("Thành viên", body, req.session.user));
});

app.post("/admin/users/:id/role", requireAdmin, async (req, res) => {
  const role = req.body.role === "ADMIN" ? "ADMIN" : "STUDENT";
  if (Number(req.params.id) === req.session.user.id) return res.redirect("/admin/users");
  await pool.query("UPDATE users SET role=? WHERE id=?", [role, req.params.id]);
  res.redirect("/admin/users?msg=" + encodeURIComponent("Đã cập nhật vai trò"));
});

app.post("/admin/users/:id/delete", requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.session.user.id) return res.redirect("/admin/users");
  await pool.query("DELETE FROM attempts WHERE user_id=?", [req.params.id]);
  await pool.query("DELETE FROM users WHERE id=?", [req.params.id]);
  const q = String(req.body.return_q || "").slice(0, 120);
  const role = ["ADMIN", "STUDENT"].includes(String(req.body.return_role || "").toUpperCase()) ? String(req.body.return_role).toUpperCase() : "";
  const page = Math.max(1, parseInt(req.body.return_page, 10) || 1);
  res.redirect(`/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}&page=${page}&msg=` + encodeURIComponent("Đã xóa thành viên"));
});

app.get("/admin/quizzes", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  const tag = String(req.query.tag || "").trim();
  const pageSize = 10;
  const requestedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
  const clauses = [], params = [];
  if (q) { clauses.push(`(q.title LIKE ? OR q.description LIKE ? OR q.tags LIKE ? OR u.full_name LIKE ? OR CAST(q.id AS CHAR) LIKE ?)`); const pattern = `%${q}%`; params.push(pattern, pattern, pattern, pattern, pattern); }
  if (tag && PREDEFINED_TAGS.includes(tag)) { clauses.push("FIND_IN_SET(?, REPLACE(q.tags, ', ', ',')) > 0"); params.push(tag); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM quizzes q LEFT JOIN users u ON u.id=q.created_by ${where}`, params);
  const total = Number(countRow.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const [quizzes] = await pool.query(`
    SELECT q.*, COUNT(DISTINCT qu.id) AS question_count, u.full_name AS author
    FROM quizzes q
    LEFT JOIN questions qu ON qu.quiz_id = q.id
    LEFT JOIN users u ON u.id = q.created_by
    ${where}
    GROUP BY q.id ORDER BY q.id DESC LIMIT ? OFFSET ?
  `, [...params, pageSize, offset]);
  const msg = req.query.msg ? `<div class="alert alert-ok">${esc(req.query.msg)}</div>` : "";
  const pagination = totalPages > 1 ? `<nav class="pagination" aria-label="Phân trang">
    ${page > 1 ? `<a class="btn btn-ghost btn-sm" href="/admin/quizzes?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&page=${page-1}">← Trước</a>` : `<span class="btn btn-ghost btn-sm disabled">← Trước</span>`}
    <span class="page-info">Trang <strong>${page}</strong> / ${totalPages}</span>
    ${page < totalPages ? `<a class="btn btn-ghost btn-sm" href="/admin/quizzes?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&page=${page+1}">Sau →</a>` : `<span class="btn btn-ghost btn-sm disabled">Sau →</span>`}
  </nav>` : "";
  const body = `
    <div class="container admin-list-page">
      <h1 class="section-title">Quản lý đề thi</h1>
      ${msg}
      <div class="admin-list-toolbar"><form class="admin-search" method="get" action="/admin/quizzes">
        <input name="q" value="${esc(q)}" placeholder="Tìm theo ID, tên đề, mô tả hoặc tác giả..." aria-label="Tìm đề thi">
        <select name="tag" aria-label="Lọc đề thi theo tag"><option value="">Tất cả tag</option>${PREDEFINED_TAGS.map(t => `<option value="${esc(t)}" ${tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
        <button class="btn btn-primary" type="submit">Lọc / tìm kiếm</button>
        ${q || tag ? `<a class="btn btn-ghost" href="/admin/quizzes">Xóa lọc</a>` : ""}
      </form><a href="/admin/quizzes/new" class="btn btn-primary">+ Tạo đề mới</a></div>
      <p class="muted result-count">${total ? `Tìm thấy ${total} đề thi · Hiển thị ${offset + 1}–${Math.min(offset + quizzes.length, total)}` : "Không tìm thấy đề thi phù hợp."}</p>
      ${quizzes.map(qz => `
        <div class="card admin-quiz-card">
          <div class="admin-quiz-main"><h2>${esc(qz.title)}</h2>
            <p class="muted">${esc(qz.description || "Chưa có mô tả")}</p>
            <div class="meta"><span class="badge">ID: ${qz.id}</span><span class="badge">${qz.question_count} câu</span><span class="badge">${qz.duration_minutes} phút</span>
              ${qz.tags ? qz.tags.split(",").map(t => `<span class="tag-chip-static">${esc(t.trim())}</span>`).join("") : ""}
              ${qz.author ? `<span class="badge">👤 ${esc(qz.author)}</span>` : ""}<span class="badge">${qz.is_public ? "Công khai" : "Riêng tư"}</span></div>
          </div><div class="admin-quiz-actions"><a href="/admin/quizzes/${qz.id}" class="btn btn-sm btn-primary">Chỉnh sửa</a>
            <form method="post" action="/admin/quizzes/${qz.id}/delete" onsubmit="return confirm('Xóa đề này?')"><input type="hidden" name="return_q" value="${esc(q)}"><input type="hidden" name="return_tag" value="${esc(tag)}"><input type="hidden" name="return_page" value="${page}"><button class="btn btn-danger btn-sm" type="submit">Xóa đề</button></form>
          </div>
        </div>`).join("") || '<div class="card empty">Chưa có đề thi phù hợp.</div>'}
      ${pagination}
      <p style="margin-top:16px"><a href="/admin" class="btn btn-ghost">← Quay lại</a></p>
    </div>`;
  res.send(layout("Quản trị đề", body, req.session.user));
});

app.get("/admin/quizzes/new", requireAdmin, (req, res) => {
  const body = `
    <div class="container">
      <div class="card form-card" style="max-width:560px">
        <h1>Tạo đề thi</h1>
        <form method="post" action="/admin/quizzes">
          <label>Tên đề</label>
          <input name="title" required>
          <label>Mô tả</label>
          <textarea name="description" rows="3"></textarea>
          <label>Thời gian (phút)</label>
          <input type="number" name="duration_minutes" value="30" min="1">
          <label>Tag chủ đề (chọn nhiều)</label>
          ${tagsInput()}
          <label><input type="checkbox" name="shuffle_questions" value="1" style="width:auto"> Trộn thứ tự câu hỏi</label>
          <label><input type="checkbox" name="shuffle_answers" value="1" style="width:auto"> Trộn thứ tự đáp án</label>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">Tạo đề</button>
            <a href="/admin/quizzes" class="btn btn-ghost">Hủy</a>
          </div>
        </form>
      </div>
    </div>`;
  res.send(layout("Tạo đề", body, req.session.user));
});

app.post("/admin/quizzes", requireAdmin, async (req, res) => {
  const [r] = await pool.query(
    "INSERT INTO quizzes (title, description, duration_minutes, created_by, is_public, shuffle_questions, shuffle_answers, tags) VALUES (?,?,?,?,1,?,?,?)",
    [req.body.title, req.body.description || "", Number(req.body.duration_minutes) || 30, req.session.user.id, req.body.shuffle_questions ? 1 : 0, req.body.shuffle_answers ? 1 : 0, (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags ? [req.body.tags] : []).join(", ")]
  );
  res.redirect(`/admin/quizzes/${r.insertId}`);
});

app.post("/admin/quizzes/:id/delete", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM attempts WHERE quiz_id=?", [req.params.id]);
  await pool.query("DELETE FROM quizzes WHERE id=?", [req.params.id]);
  const q = String(req.body.return_q || "").slice(0, 120);
  const page = Math.max(1, parseInt(req.body.return_page, 10) || 1);
  res.redirect(`/admin/quizzes?q=${encodeURIComponent(q)}&page=${page}&msg=` + encodeURIComponent("Đã xóa đề thi"));
});

app.get("/admin/quizzes/:id", requireLogin, async (req, res) => {
  // Admin hoặc chủ sở hữu (student có email)
  const [[quiz]] = await pool.query("SELECT * FROM quizzes WHERE id=?", [req.params.id]);
  if (!quiz) return res.status(404).send(layout("404", `<div class="container"><h1>Không tìm thấy đề.</h1></div>`, req.session.user));
  const isOwner = quiz.created_by === req.session.user.id;
  const isAdmin = req.session.user.role === "ADMIN";
  if (!isAdmin && !isOwner) {
    return res.status(403).send(layout("403", `<div class="container"><h1>Không có quyền.</h1></div>`, req.session.user));
  }

  const [questions] = await pool.query("SELECT * FROM questions WHERE quiz_id=? ORDER BY id", [quiz.id]);
  let blocks = [];
  for (const q of questions) {
    const [answers] = await pool.query("SELECT * FROM answers WHERE question_id=? ORDER BY id", [q.id]);
    blocks.push(`
      <div class="card">
        <h3>Câu hỏi #${q.id}</h3>
        <form method="post" action="/admin/questions/${q.id}/update">
          <textarea name="content" required rows="2">${esc(q.content)}</textarea>
          ${answers.map(a => `
            <div class="grid-2" style="align-items:center;margin:8px 0">
              <input name="answer_${a.id}" value="${esc(a.content)}" required>
              <label style="margin:0"><input type="radio" name="correct_answer" value="${a.id}" ${a.is_correct ? "checked" : ""} style="width:auto"> Đáp án đúng</label>
            </div>`).join("")}
          <button class="btn btn-primary btn-sm" type="submit">Lưu câu hỏi</button>
        </form>
        <form method="post" action="/admin/questions/${q.id}/delete" style="margin-top:8px" onsubmit="return confirm('Xóa câu hỏi?')">
          <button class="btn btn-danger btn-sm" type="submit">Xóa câu hỏi</button>
        </form>
      </div>`);
  }

  const body = `
    <div class="container">
      <h1>${esc(quiz.title)}</h1>
      <p class="muted">${esc(quiz.description || "")} · ${quiz.duration_minutes} phút</p>
      ${blocks.join("")}
      <div class="card">
        <h2>Thêm câu hỏi</h2>
        <form method="post" action="/admin/quizzes/${quiz.id}/questions">
          <label>Loại câu hỏi</label>
          <select name="qtype" id="qtypeSelect">
            <option value="single">Chọn 1 đáp án</option>
            <option value="multiple">Chọn nhiều đáp án</option>
            <option value="truefalse">Đúng / Sai</option>
            <option value="fill">Điền vào chỗ trống</option>
            <option value="order">Sắp xếp thứ tự</option>
            <option value="match">Ghép cặp</option>
          </select>
          <label>Nội dung câu hỏi</label>
          <textarea name="content" required rows="2"></textarea>
          <div id="optsSingle">
            <p class="muted">4 đáp án — chọn 1 đúng</p>
            <div class="grid-2">${[1,2,3,4].map(i=>`<input name="answer_${i}" placeholder="Đáp án ${i}">`).join("")}</div>
            <label>Đáp án đúng</label>
            <select name="correct_index"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
          </div>
          <div id="optsMulti" style="display:none">
            <p class="muted">4 đáp án — tick các đáp án đúng</p>
            <div class="grid-2">${[1,2,3,4].map(i=>`<div><input name="answer_${i}" placeholder="Đáp án ${i}"><label><input type="checkbox" name="correct_multi" value="${i}" style="width:auto"> Đúng</label></div>`).join("")}</div>
          </div>
          <div id="optsFill" style="display:none">
            <label>Đáp án đúng (một từ/cụm từ)</label>
            <input name="fill_answer" placeholder="vd: run">
          </div>
          <div id="optsOrder" style="display:none">
            <p class="muted">Nhập các mục theo đúng thứ tự (1→n)</p>
            ${[1,2,3,4].map(i=>`<input name="order_${i}" placeholder="Mục thứ ${i}">`).join("")}
          </div>
          <div id="optsMatch" style="display:none">
            <p class="muted">3 cặp: bên trái — bên phải</p>
            ${[1,2,3].map(i=>`<div class="grid-2"><input name="match_l_${i}" placeholder="Trái ${i}"><input name="match_r_${i}" placeholder="Phải ${i}"></div>`).join("")}
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Thêm câu hỏi</button></div>
        </form>
        <script>
        (function(){
          var s=document.getElementById('qtypeSelect');
          function sync(){
            var v=s.value;
            document.getElementById('optsSingle').style.display=(v==='single'||v==='truefalse')?'block':'none';
            document.getElementById('optsMulti').style.display=v==='multiple'?'block':'none';
            document.getElementById('optsFill').style.display=v==='fill'?'block':'none';
            document.getElementById('optsOrder').style.display=v==='order'?'block':'none';
            document.getElementById('optsMatch').style.display=v==='match'?'block':'none';
          }
          s.addEventListener('change',sync);sync();
        })();
        </script>
      </div>
      <p><a href="${isAdmin ? "/admin/quizzes" : "/my-quizzes"}" class="btn btn-ghost">← Quay lại</a></p>
    </div>`;
  res.send(layout("Chỉnh sửa đề", body, req.session.user));
});

app.post("/admin/quizzes/:id/questions", requireLogin, async (req, res) => {
  const [[quiz]] = await pool.query("SELECT * FROM quizzes WHERE id=?", [req.params.id]);
  if (!quiz) return res.status(404).send("Not found");
  if (req.session.user.role !== "ADMIN" && quiz.created_by !== req.session.user.id) return res.status(403).send("Forbidden");
  const qtype = req.body.qtype || "single";
  const [r] = await pool.query("INSERT INTO questions (quiz_id, content, qtype) VALUES (?,?,?)", [req.params.id, req.body.content, qtype]);
  const qid = r.insertId;
  if (qtype === "fill") {
    await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order) VALUES (?,?,1,0)", [qid, req.body.fill_answer || ""]);
  } else if (qtype === "truefalse") {
    await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order) VALUES (?,?,?,0)", [qid, "Đúng", Number(req.body.correct_index) === 1 ? 1 : 0]);
    await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order) VALUES (?,?,?,1)", [qid, "Sai", Number(req.body.correct_index) === 2 ? 1 : 0]);
  } else if (qtype === "order") {
    for (let i = 1; i <= 4; i++) {
      const c = (req.body[`order_${i}`] || "").trim();
      if (!c) continue;
      await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order) VALUES (?,?,1,?)", [qid, c, i]);
    }
  } else if (qtype === "match") {
    for (let i = 1; i <= 3; i++) {
      const L = (req.body[`match_l_${i}`] || "").trim();
      const R = (req.body[`match_r_${i}`] || "").trim();
      if (!L || !R) continue;
      const key = "P" + i;
      await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order, pair_key) VALUES (?,?,1,?,?)", [qid, L, i - 1, key]);
      await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order, pair_key) VALUES (?,?,0,?,?)", [qid, R, 10 + i, key]);
    }
  } else if (qtype === "multiple") {
    let corrects = req.body.correct_multi || [];
    if (!Array.isArray(corrects)) corrects = [corrects];
    const set = new Set(corrects.map(Number));
    for (let i = 1; i <= 4; i++) {
      await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order) VALUES (?,?,?,?)",
        [qid, req.body[`answer_${i}`] || "", set.has(i) ? 1 : 0, i - 1]);
    }
  } else {
    // single
    const correct = Number(req.body.correct_index) || 1;
    for (let i = 1; i <= 4; i++) {
      await pool.query("INSERT INTO answers (question_id, content, is_correct, sort_order) VALUES (?,?,?,?)",
        [qid, req.body[`answer_${i}`] || "", i === correct ? 1 : 0, i - 1]);
    }
  }
  res.redirect(`/admin/quizzes/${req.params.id}`);
});

app.post("/admin/questions/:id/update", requireLogin, async (req, res) => {
  const [[q]] = await pool.query("SELECT quiz_id FROM questions WHERE id=?", [req.params.id]);
  if (!q) return res.status(404).send("Not found");
  const [[quiz]] = await pool.query("SELECT * FROM quizzes WHERE id=?", [q.quiz_id]);
  const isOwner = quiz.created_by === req.session.user.id;
  const isAdmin = req.session.user.role === "ADMIN";
  if (!isAdmin && !isOwner) return res.status(403).send("Forbidden");

  await pool.query("UPDATE questions SET content=? WHERE id=?", [req.body.content, req.params.id]);
  const [answers] = await pool.query("SELECT id FROM answers WHERE question_id=? ORDER BY id", [req.params.id]);
  for (const a of answers) {
    await pool.query(
      "UPDATE answers SET content=?, is_correct=? WHERE id=?",
      [req.body[`answer_${a.id}`], Number(req.body.correct_answer) === a.id, a.id]
    );
  }
  res.redirect(`/admin/quizzes/${q.quiz_id}`);
});

app.post("/admin/questions/:id/delete", requireLogin, async (req, res) => {
  const [[q]] = await pool.query("SELECT quiz_id FROM questions WHERE id=?", [req.params.id]);
  if (!q) return res.status(404).send("Not found");
  const [[quiz]] = await pool.query("SELECT * FROM quizzes WHERE id=?", [q.quiz_id]);
  const isOwner = quiz.created_by === req.session.user.id;
  const isAdmin = req.session.user.role === "ADMIN";
  if (!isAdmin && !isOwner) return res.status(403).send("Forbidden");
  await pool.query("DELETE FROM questions WHERE id=?", [req.params.id]);
  res.redirect(`/admin/quizzes/${q.quiz_id}`);
});

app.get("/api/quizzes", async (req, res) => {
  try {
    const q=(req.query.q||"").trim(), tag=(req.query.tag||"").trim();
    const page=Math.max(1,parseInt(req.query.page,10)||1), size=9;
    let where="q.is_public=1", params=[];
    if(q){where+=" AND (q.title COLLATE utf8mb4_0900_ai_ci LIKE ? OR q.description COLLATE utf8mb4_0900_ai_ci LIKE ?)";params.push("%"+q+"%","%"+q+"%");}
    if(tag){where+=" AND FIND_IN_SET(?,REPLACE(q.tags,', ',','))>0";params.push(tag);}
    const [[c]]=await pool.query(`SELECT COUNT(*) total FROM quizzes q WHERE ${where}`,params);
    const total=Number(c.total), pages=Math.max(1,Math.ceil(total/size)), current=Math.min(page,pages);
    const [rows]=await pool.query(`SELECT q.id,q.title,q.description,q.tags,q.duration_minutes,q.created_at,
      COUNT(DISTINCT qu.id) question_count,COUNT(DISTINCT a.id) attempt_count,u.full_name author
      FROM quizzes q LEFT JOIN questions qu ON qu.quiz_id=q.id LEFT JOIN attempts a ON a.quiz_id=q.id
      LEFT JOIN users u ON u.id=q.created_by WHERE ${where} GROUP BY q.id ORDER BY q.id DESC LIMIT ? OFFSET ?`,
      [...params,size,(current-1)*size]);
    res.json({items:rows.map(r=>({...r,tags:parseTags(r.tags)})),total,page:current,pages});
  } catch(e){console.error(e);res.status(500).json({error:"Search failed"});}
});

app.use((req, res) => {
  res.status(404).send(layout("404", `<div class="container"><div class="card"><h1>404</h1><p>Không tìm thấy trang.</p><a href="/" class="btn btn-primary">Về trang chủ</a></div></div>`, req.session.user));
});

ensureFeatureSchema().then(() => app.listen(PORT, "0.0.0.0", () => console.log(`TKQTHT Quiz app running on port ${PORT}`))).catch(error => {
  console.error("Database initialization failed:", error); process.exit(1);
});
