const express = require("express");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  if (req.path == "/" || req.path == "/health") res.setHeader("Content-Type", "text/html; charset=utf-8");
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  next();
});

const pool = mysql.createPool({
  charset: "utf8mb4",
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "quiz_user",
  password: process.env.DB_PASSWORD || "change_me_app",
  database: process.env.DB_NAME || "quiz_db",
  waitForConnections: true,
  connectionLimit: 10
});

app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");

    res.json({
      status: "ok",
      database: rows[0].ok === 1 ? "connected" : "unknown"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      message: error.message
    });
  }
});

app.get("/api/quizzes", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        title,
        description,
        duration_minutes,
        created_at
      FROM quizzes
      ORDER BY id DESC
    `);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(rows);
  } catch (error) {
    console.error("Error loading quizzes:", error);
    res.status(500).json({
      error: "Cannot load quizzes"
    });
  }
});

app.get("/", async (req, res) => {
  try {
    const [quizzes] = await pool.query(`
      SELECT
        id,
        title,
        description,
        duration_minutes
      FROM quizzes
      ORDER BY id DESC
    `);

    const quizList = quizzes.length
      ? quizzes
          .map(
            (quiz) => `
              <li>
                <strong>${quiz.title}</strong>
                <br>
                ${quiz.description || ""}
                <br>
                Thời gian: ${quiz.duration_minutes} phút
              </li>
            `
          )
          .join("")
      : "<li>Chưa có đề thi.</li>";

    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quiz System</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 50px auto;
            padding: 20px;
          }

          h1 {
            color: #1f2937;
          }

          .card {
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 10px;
            margin-top: 20px;
          }

          li {
            margin-bottom: 20px;
          }

          .status {
            color: green;
            font-weight: bold;
          }
        </style>
      </head>

      <body>
        <h1>Hệ thống Quiz / Thi trắc nghiệm</h1>

        <div class="card">
          <p class="status">✓ Web application đang hoạt động</p>
          <p>Backend: Node.js + Express</p>
          <p>Database: MySQL</p>
        </div>

        <div class="card">
          <h2>Danh sách đề thi</h2>
          <ul>
            ${quizList}
          </ul>
        </div>

        <div class="card">
          <a href="/health">Kiểm tra Database Health</a>
          <br><br>
          <a href="/api/quizzes">API danh sách Quiz</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error loading homepage:", error);

    res.status(500).send(`
      <h1>Quiz System</h1>
      <p>Không thể kết nối Database.</p>
      <pre>${error.message}</pre>
    `);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Quiz app running on port ${PORT}`);
});
