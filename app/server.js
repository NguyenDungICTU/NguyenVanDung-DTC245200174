const express = require("express");
const session = require("express-session");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "day2-demo-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
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

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function layout(title, body, user = null) {
  return `<!doctype html><html lang="vi"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:Arial,sans-serif;max-width:1000px;margin:30px auto;padding:0 18px;color:#1f2937}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:25px;padding:12px;background:#f3f4f6;border-radius:10px}a{color:#2563eb;text-decoration:none}button{font:inherit;padding:9px 14px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer}.danger{background:#dc2626!important}.card{border:1px solid #ddd;border-radius:10px;padding:20px;margin:15px 0}.muted{color:#6b7280}.ok{color:#15803d;font-weight:bold}.score{font-size:32px;font-weight:bold}.answer{padding:10px;border:1px solid #ddd;border-radius:7px;margin:7px 0}input,textarea,select{width:100%;box-sizing:border-box;padding:9px;margin:6px 0 12px;border:1px solid #ccc;border-radius:6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style></head><body>
<nav><a href="/">Quiz</a>${user ? `<span>Xin chào, ${esc(user.full_name)} (${esc(user.role)})</span><a href="/history">Lịch sử</a>${user.role === "ADMIN" ? '<a href="/admin/quizzes">Quản trị</a>' : ''}<a href="/logout">Đăng xuất</a>` : '<a href="/login">Đăng nhập</a>'}</nav>${body}</body></html>`;
}

function requireLogin(req,res,next){ if(!req.session.user) return res.redirect("/login"); next(); }
function requireAdmin(req,res,next){ if(!req.session.user || req.session.user.role !== "ADMIN") return res.status(403).send(layout("403","<h1>403</h1><p>Bạn không có quyền truy cập.</p>")); next(); }

app.get("/health", async (req,res)=>{
  try { const [rows]=await pool.query("SELECT 1 AS ok"); res.json({status:"ok",database:rows[0].ok===1?"connected":"unknown"}); }
  catch(error){ res.status(500).json({status:"error",database:"disconnected",message:error.message}); }
});

app.get("/", async (req,res)=>{
  try{
    const [quizzes]=await pool.query("SELECT id,title,description,duration_minutes FROM quizzes ORDER BY id DESC");
    const cards=quizzes.map(q=>`<div class="card"><h2>${esc(q.title)}</h2><p>${esc(q.description)}</p><p><b>Thời gian:</b> ${q.duration_minutes} phút</p><a href="/quiz/${q.id}">Xem đề →</a></div>`).join("");
    res.send(layout("Danh sách đề thi",`<h1>Hệ thống Quiz / Thi trắc nghiệm</h1><p class="muted">Danh sách đề thi.</p>${cards || "<p>Chưa có đề thi.</p>"}`,req.session.user));
  }catch(error){res.status(500).send(layout("Lỗi","<h1>Không thể tải danh sách đề.</h1>"));}
});

app.get("/login",(req,res)=>res.send(layout("Đăng nhập",`<h1>Đăng nhập</h1><div class="card"><form method="post" action="/login"><label>Email</label><input type="email" name="email" required placeholder="student@example.com"><button>Đăng nhập</button></form><p class="muted">Demo: admin@example.com hoặc student@example.com</p></div>`)));
app.post("/login",async(req,res)=>{const [rows]=await pool.query("SELECT id,full_name,email,role FROM users WHERE email=? LIMIT 1",[req.body.email]);if(!rows.length)return res.status(401).send(layout("Lỗi","<h1>Email không tồn tại</h1><a href='/login'>Thử lại</a>"));req.session.user=rows[0];res.redirect("/");});
app.get("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));

app.get("/quiz/:id",async(req,res)=>{
  const [[quiz]]=await pool.query("SELECT * FROM quizzes WHERE id=?",[req.params.id]);
  if(!quiz)return res.status(404).send(layout("404","<h1>Không tìm thấy đề.</h1>"));
  const [questions]=await pool.query("SELECT * FROM questions WHERE quiz_id=? ORDER BY id",[quiz.id]);
  let answers=[]; if(questions.length){const ids=questions.map(q=>q.id);[answers]=await pool.query(`SELECT * FROM answers WHERE question_id IN (${ids.map(()=>"?").join(",")}) ORDER BY id`,ids);}
  const byQuestion={}; answers.forEach(a=>(byQuestion[a.question_id]??=[]).push(a));
  const form=questions.map((q,i)=>`<div class="card"><h3>Câu ${i+1}. ${esc(q.content)}</h3>${(byQuestion[q.id]||[]).map(a=>`<div class="answer"><label><input type="radio" name="q_${q.id}" value="${a.id}" required> ${esc(a.content)}</label></div>`).join("")}</div>`).join("");
  const body=req.session.user?`<h1>${esc(quiz.title)}</h1><p>${esc(quiz.description)}</p><p><b>${questions.length} câu</b> · <b>${quiz.duration_minutes} phút</b></p><form method="post" action="/quiz/${quiz.id}/submit">${form}<button type="submit">Nộp bài</button></form>`:`<h1>${esc(quiz.title)}</h1><div class="card"><p>${esc(quiz.description)}</p><p><b>${questions.length} câu</b> · <b>${quiz.duration_minutes} phút</b></p><p>Bạn cần đăng nhập để làm bài.</p><a href="/login">Đăng nhập</a></div>`;
  res.send(layout(quiz.title,body,req.session.user));
});

app.post("/quiz/:id/submit",requireLogin,async(req,res)=>{
  const [[quiz]]=await pool.query("SELECT * FROM quizzes WHERE id=?",[req.params.id]); if(!quiz)return res.status(404).send("Quiz not found");
  const [questions]=await pool.query("SELECT id FROM questions WHERE quiz_id=? ORDER BY id",[quiz.id]); let correct=0;
  for(const q of questions){const selected=req.body[`q_${q.id}`];if(!selected)continue;const [[answer]]=await pool.query("SELECT is_correct FROM answers WHERE id=? AND question_id=?",[selected,q.id]);if(answer&&Number(answer.is_correct)===1)correct++;}
  const total=questions.length; const score=total?Math.round((correct/total*10)*100)/100:0;
  const [result]=await pool.query("INSERT INTO attempts(quiz_id,user_id,score) VALUES(?,?,?)",[quiz.id,req.session.user.id,score]);
  res.redirect(`/result/${result.insertId}`);
});

app.get("/result/:id",requireLogin,async(req,res)=>{const [[a]]=await pool.query("SELECT a.*,q.title FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.id=? AND a.user_id=?",[req.params.id,req.session.user.id]);if(!a)return res.status(404).send(layout("404","<h1>Không tìm thấy kết quả.</h1>"));res.send(layout("Kết quả",`<h1>Kết quả bài thi</h1><div class="card"><h2>${esc(a.title)}</h2><p>Số điểm:</p><p class="score">${a.score}/10</p><p class="ok">✓ Hệ thống đã tự động chấm điểm và lưu kết quả.</p><a href="/history">Xem lịch sử kết quả</a></div>`,req.session.user));});
app.get("/history",requireLogin,async(req,res)=>{const [rows]=await pool.query("SELECT a.id,q.title,a.score,a.submitted_at FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.user_id=? ORDER BY a.submitted_at DESC",[req.session.user.id]);res.send(layout("Lịch sử",`<h1>Lịch sử kết quả</h1><table><tr><th>Đề</th><th>Điểm</th><th>Thời gian</th></tr>${rows.map(r=>`<tr><td>${esc(r.title)}</td><td><b>${r.score}/10</b></td><td>${new Date(r.submitted_at).toLocaleString("vi-VN")}</td></tr>`).join("")}</table>`,req.session.user));});

app.get("/admin/quizzes",requireAdmin,async(req,res)=>{const [quizzes]=await pool.query("SELECT q.*,COUNT(DISTINCT qu.id) question_count FROM quizzes q LEFT JOIN questions qu ON qu.quiz_id=q.id GROUP BY q.id ORDER BY q.id DESC");res.send(layout("Quản trị",`<h1>Quản trị đề thi</h1><p><a href="/admin/quizzes/new">+ Tạo đề mới</a></p>${quizzes.map(q=>`<div class="card"><h2>${esc(q.title)}</h2><p>${esc(q.description)}</p><p>${q.question_count} câu · ${q.duration_minutes} phút</p><a href="/admin/quizzes/${q.id}">Chỉnh sửa câu hỏi</a> <form style="display:inline" method="post" action="/admin/quizzes/${q.id}/delete"><button class="danger">Xóa đề</button></form></div>`).join("")}`,req.session.user));});
app.get("/admin/quizzes/new",requireAdmin,(req,res)=>res.send(layout("Tạo đề",`<h1>Tạo đề thi</h1><form method="post" action="/admin/quizzes"><label>Tên đề</label><input name="title" required><label>Mô tả</label><textarea name="description"></textarea><label>Thời gian (phút)</label><input type="number" name="duration_minutes" value="30" min="1"><button>Tạo đề</button></form>`,req.session.user)));
app.post("/admin/quizzes",requireAdmin,async(req,res)=>{const [r]=await pool.query("INSERT INTO quizzes(title,description,duration_minutes) VALUES(?,?,?)",[req.body.title,req.body.description,Number(req.body.duration_minutes)||30]);res.redirect(`/admin/quizzes/${r.insertId}`);});
app.post("/admin/quizzes/:id/delete",requireAdmin,async(req,res)=>{await pool.query("DELETE FROM quizzes WHERE id=?",[req.params.id]);res.redirect("/admin/quizzes");});

app.get("/admin/quizzes/:id",requireAdmin,async(req,res)=>{
  const [[quiz]]=await pool.query("SELECT * FROM quizzes WHERE id=?",[req.params.id]); if(!quiz)return res.status(404).send(layout("404","<h1>Không tìm thấy đề.</h1>"));
  const [questions]=await pool.query("SELECT * FROM questions WHERE quiz_id=? ORDER BY id",[quiz.id]); let blocks=[];
  for(const q of questions){const [answers]=await pool.query("SELECT * FROM answers WHERE question_id=? ORDER BY id",[q.id]);blocks.push(`<div class="card"><h3>Câu hỏi #${q.id}</h3><form method="post" action="/admin/questions/${q.id}/update"><textarea name="content" required>${esc(q.content)}</textarea>${answers.map(a=>`<div class="grid"><input name="answer_${a.id}" value="${esc(a.content)}" required><label><input type="radio" name="correct_answer" value="${a.id}" ${a.is_correct?'checked':''}> Đúng</label></div>`).join("")}<button>Lưu câu hỏi</button></form><form method="post" action="/admin/questions/${q.id}/delete" style="margin-top:8px"><button class="danger">Xóa câu hỏi</button></form></div>`);}
  res.send(layout("Chỉnh sửa đề",`<h1>${esc(quiz.title)}</h1><p>${esc(quiz.description)} · ${quiz.duration_minutes} phút</p>${blocks.join("")}<div class="card"><h2>Thêm câu hỏi</h2><form method="post" action="/admin/quizzes/${quiz.id}/questions"><label>Nội dung</label><textarea name="content" required></textarea><div class="grid">${[1,2,3,4].map(i=>`<input name="answer_${i}" placeholder="Đáp án ${i}" required>`).join("")}</div><label>Đáp án đúng</label><select name="correct_index"><option value="1">Đáp án 1</option><option value="2">Đáp án 2</option><option value="3">Đáp án 3</option><option value="4">Đáp án 4</option></select><button>Thêm câu hỏi</button></form></div><a href="/admin/quizzes">← Quay lại</a>`,req.session.user));
});
app.post("/admin/quizzes/:id/questions",requireAdmin,async(req,res)=>{const [r]=await pool.query("INSERT INTO questions(quiz_id,content) VALUES(?,?)",[req.params.id,req.body.content]);const correct=Number(req.body.correct_index);for(let i=1;i<=4;i++)await pool.query("INSERT INTO answers(question_id,content,is_correct) VALUES(?,?,?)",[r.insertId,req.body[`answer_${i}`],i===correct]);res.redirect(`/admin/quizzes/${req.params.id}`);});
app.post("/admin/questions/:id/update",requireAdmin,async(req,res)=>{await pool.query("UPDATE questions SET content=? WHERE id=?",[req.body.content,req.params.id]);const [answers]=await pool.query("SELECT id FROM answers WHERE question_id=? ORDER BY id",[req.params.id]);for(const a of answers)await pool.query("UPDATE answers SET content=?,is_correct=? WHERE id=?",[req.body[`answer_${a.id}`],Number(req.body.correct_answer)===a.id,a.id]);const [[q]]=await pool.query("SELECT quiz_id FROM questions WHERE id=?",[req.params.id]);res.redirect(`/admin/quizzes/${q.quiz_id}`);});
app.post("/admin/questions/:id/delete",requireAdmin,async(req,res)=>{const [[q]]=await pool.query("SELECT quiz_id FROM questions WHERE id=?",[req.params.id]);await pool.query("DELETE FROM questions WHERE id=?",[req.params.id]);res.redirect(`/admin/quizzes/${q.quiz_id}`);});

app.get("/api/quizzes",async(req,res)=>{const [rows]=await pool.query("SELECT id,title,description,duration_minutes,created_at FROM quizzes ORDER BY id DESC");res.json(rows);});
app.use((req,res)=>res.status(404).send(layout("404","<h1>404</h1><p>Không tìm thấy trang.</p>")));
app.listen(PORT,"0.0.0.0",()=>console.log(`Quiz app Day 2 running on port ${PORT}`));
