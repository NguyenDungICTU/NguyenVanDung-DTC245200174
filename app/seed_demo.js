const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const topics = [["Docker cơ bản", "Docker, image, container, volume và network."], ["Docker Compose", "Service, network, volume và cấu hình Compose."], ["Linux cơ bản", "Lệnh shell, file, process và quyền truy cập."], ["Quản trị tiến trình Linux", "Process, signal, systemd và tài nguyên."], ["Mạng máy tính", "TCP/IP, OSI, DNS, DHCP và routing."], ["HTTP và HTTPS", "HTTP methods, status code, TLS và header."], ["HTML cơ bản", "Semantic HTML, form, link và media."], ["CSS cơ bản", "Selector, box model, flexbox và grid."], ["JavaScript cơ bản", "Kiểu dữ liệu, hàm, mảng và object."], ["JavaScript bất đồng bộ", "Promise, async/await, event loop và fetch."], ["Node.js và Express", "Module, middleware, routing và error handling."], ["REST API", "Resource, HTTP methods, JSON và status code."], ["Python cơ bản", "Kiểu dữ liệu, điều kiện, vòng lặp và hàm."], ["Python hướng đối tượng", "Class, object, inheritance và encapsulation."], ["Cơ sở dữ liệu SQL", "SELECT, WHERE, JOIN, GROUP BY và subquery."], ["Thiết kế cơ sở dữ liệu", "Khóa, quan hệ, chuẩn hóa và toàn vẹn."], ["MySQL quản trị", "User, privilege, index, transaction và backup."], ["Git cơ bản", "Repository, commit, branch và merge."], ["Git nâng cao", "Rebase, cherry-pick, tag và conflict."], ["Kiểm thử phần mềm", "Unit test, integration test và test case."], ["Bảo mật web", "XSS, CSRF, injection và session."], ["Xác thực và phân quyền", "Password hash, session, role và least privilege."], ["Thuật toán cơ bản", "Độ phức tạp, tìm kiếm và sắp xếp."], ["Cấu trúc dữ liệu", "Stack, queue, linked list, tree và hash map."], ["Lập trình hướng đối tượng", "Abstraction, encapsulation, inheritance và polymorphism."], ["Phân tích hệ thống", "Requirement, actor, use case và workflow."], ["UML cơ bản", "Use case, class, sequence và activity diagram."], ["Agile và Scrum", "Sprint, backlog, review, retrospective và role."], ["CI/CD", "Pipeline, build, test, deploy và rollback."], ["DevOps tổng quan", "Automation, collaboration, observability và feedback."], ["Prometheus", "Metric, scrape, target, exporter và PromQL."], ["Grafana", "Dashboard, panel, data source và alert."], ["Logging với Loki", "Log stream, label, Promtail và LogQL."], ["Nginx reverse proxy", "Upstream, proxy header, TLS và redirect."], ["HTTPS và TLS", "Certificate, public key, handshake và CA."], ["Cloud computing", "IaaS, PaaS, SaaS, region và availability zone."], ["Trí tuệ nhân tạo nhập môn", "Dataset, model, training, inference và evaluation."], ["Học máy cơ bản", "Feature, label, overfitting, validation và metric."], ["Phân tích dữ liệu", "Data cleaning, aggregation, visualization và KPI."], ["An toàn vận hành hệ thống", "Backup, monitoring, incident response và recovery."]];
const stems = [["Khái niệm cốt lõi nào phù hợp nhất với chủ đề này?", "Một thành phần hoặc nguyên tắc được dùng đúng mục đích trong hệ thống"], ["Khi triển khai {topic}, lựa chọn nào là hợp lý nhất?", "Làm theo cấu hình chuẩn, kiểm tra kết quả và ghi log khi cần"], ["Mục đích chính của việc kiểm tra cấu hình là gì?", "Phát hiện lỗi trước khi đưa thay đổi vào sử dụng"], ["Khi gặp lỗi, bước đầu tiên nên làm gì?", "Đọc thông báo lỗi và kiểm tra log liên quan"], ["Lựa chọn nào giúp hệ thống dễ bảo trì hơn?", "Tách trách nhiệm rõ ràng và dùng cấu hình nhất quán"], ["Tình huống nào thể hiện cách sử dụng đúng?", "Chọn công cụ phù hợp yêu cầu và xác minh kết quả"], ["Điều gì nên được ưu tiên khi vận hành hệ thống?", "Tính đúng đắn, an toàn và khả năng quan sát"], ["Vì sao cần tài liệu hóa quy trình?", "Giúp người khác tái hiện và kiểm tra các bước"], ["Cách nào giảm nguy cơ phát sinh lỗi khi thay đổi?", "Kiểm thử thay đổi trong môi trường phù hợp trước khi phát hành"], ["Thông tin nào hữu ích nhất khi điều tra sự cố?", "Thời điểm, thông báo lỗi, log và các thay đổi gần nhất"], ["Đâu là ví dụ về tự động hóa phù hợp?", "Tự động chạy các bước lặp lại có thể kiểm tra được"], ["Khi phân quyền tài khoản, nên áp dụng nguyên tắc nào?", "Chỉ cấp quyền tối thiểu cần thiết cho công việc"], ["Lựa chọn nào giúp dữ liệu nhất quán hơn?", "Áp dụng quy tắc kiểm tra và ràng buộc phù hợp"], ["Khi nâng cấp phiên bản, cần làm gì trước?", "Đọc thay đổi, sao lưu khi cần và thử trên môi trường kiểm thử"], ["Dấu hiệu nào cho thấy một bước đã hoàn thành?", "Có kết quả kiểm tra cụ thể xác nhận bước đó"], ["Tại sao nên tách môi trường phát triển và vận hành?", "Giảm ảnh hưởng của thử nghiệm lên hệ thống đang dùng"], ["Khi cần chia sẻ bí mật truy cập, cách nào an toàn hơn?", "Dùng biến môi trường hoặc kho bí mật, tránh commit vào mã nguồn"], ["Lựa chọn nào mô tả giám sát hiệu quả?", "Theo dõi chỉ số có ý nghĩa và cảnh báo theo ngưỡng phù hợp"], ["Khi xử lý dữ liệu đầu vào, nên làm gì?", "Kiểm tra định dạng và giới hạn dữ liệu trước khi xử lý"], ["Sau khi sửa lỗi, bước nào không nên bỏ qua?", "Chạy lại kiểm thử liên quan và ghi nhận kết quả"]];
const config = {
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "quiz_user",
  password: process.env.DB_PASSWORD || "change_me_app",
  database: process.env.DB_NAME || "quiz_db",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 2,
  multipleStatements: false
};

async function main() {
  const pool = mysql.createPool(config);
  const password = "QuizDemo2026!";
  const passwordHash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  try {
    console.log("WARNING: this seed replaces existing attempts, answers, questions, quizzes and users.");
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    for (const table of ["attempts", "answers", "questions", "quizzes", "users"]) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS=1");

    const users = [];
    for (let i = 1; i <= 40; i++) {
      const admin = i <= 3;
      const username = admin ? `admin${i}` : `student${String(i - 3).padStart(2, "0")}`;
      const fullName = admin ? ["Quản trị viên 01", "Quản trị viên 02", "Quản trị viên 03"][i - 1] : `Học sinh ${String(i - 3).padStart(2, "0")}`;
      const email = `${username}@quiz-demo.local`;
      const [result] = await conn.query(
        "INSERT INTO users(full_name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
        [fullName, username, email, passwordHash, admin ? "ADMIN" : "STUDENT"]
      );
      users.push(result.insertId);
    }

    const qTemplates = [
      ["Khái niệm cốt lõi nào phù hợp nhất với chủ đề này?", "Một thành phần hoặc nguyên tắc được dùng đúng mục đích trong hệ thống"],
      ["Khi triển khai {topic}, lựa chọn nào là hợp lý nhất?", "Làm theo cấu hình chuẩn, kiểm tra kết quả và ghi log khi cần"],
      ["Mục đích chính của việc kiểm tra cấu hình là gì?", "Phát hiện lỗi trước khi đưa thay đổi vào sử dụng"],
      ["Khi gặp lỗi, bước đầu tiên nên làm gì?", "Đọc thông báo lỗi và kiểm tra log liên quan"],
      ["Lựa chọn nào giúp hệ thống dễ bảo trì hơn?", "Tách trách nhiệm rõ ràng và dùng cấu hình nhất quán"],
      ["Tình huống nào thể hiện cách sử dụng đúng?", "Chọn công cụ phù hợp yêu cầu và xác minh kết quả"],
      ["Điều gì nên được ưu tiên khi vận hành hệ thống?", "Tính đúng đắn, an toàn và khả năng quan sát"],
      ["Vì sao cần tài liệu hóa quy trình?", "Giúp người khác tái hiện và kiểm tra các bước"],
      ["Cách nào giảm nguy cơ phát sinh lỗi khi thay đổi?", "Kiểm thử thay đổi trong môi trường phù hợp trước khi phát hành"],
      ["Thông tin nào hữu ích nhất khi điều tra sự cố?", "Thời điểm, thông báo lỗi, log và các thay đổi gần nhất"],
      ["Đâu là ví dụ về tự động hóa phù hợp?", "Tự động chạy các bước lặp lại có thể kiểm tra được"],
      ["Khi phân quyền tài khoản, nên áp dụng nguyên tắc nào?", "Chỉ cấp quyền tối thiểu cần thiết cho công việc"],
      ["Lựa chọn nào giúp dữ liệu nhất quán hơn?", "Áp dụng quy tắc kiểm tra và ràng buộc phù hợp"],
      ["Khi nâng cấp phiên bản, cần làm gì trước?", "Đọc thay đổi, sao lưu khi cần và thử trên môi trường kiểm thử"],
      ["Dấu hiệu nào cho thấy một bước đã hoàn thành?", "Có kết quả kiểm tra cụ thể xác nhận bước đó"],
      ["Tại sao nên tách môi trường phát triển và vận hành?", "Giảm ảnh hưởng của thử nghiệm lên hệ thống đang dùng"],
      ["Khi cần chia sẻ bí mật truy cập, cách nào an toàn hơn?", "Dùng biến môi trường hoặc kho bí mật, tránh commit vào mã nguồn"],
      ["Lựa chọn nào mô tả giám sát hiệu quả?", "Theo dõi chỉ số có ý nghĩa và cảnh báo theo ngưỡng phù hợp"],
      ["Khi xử lý dữ liệu đầu vào, nên làm gì?", "Kiểm tra định dạng và giới hạn dữ liệu trước khi xử lý"],
      ["Sau khi sửa lỗi, bước nào không nên bỏ qua?", "Chạy lại kiểm thử liên quan và ghi nhận kết quả"]
    ];
    const distractors = [
      "Bỏ qua kiểm tra để tiết kiệm thời gian", "Cấp quyền quản trị cho mọi tài khoản",
      "Lưu toàn bộ bí mật trực tiếp trong mã nguồn", "Chỉ dựa vào cảm tính mà không xác minh"
    ];
    for (let qi = 0; qi < topics.length; qi++) {
      const [title, description] = topics[qi];
      const duration = 20 + (qi % 4) * 5;
      const [quizResult] = await conn.query(
        "INSERT INTO quizzes(title, description, duration_minutes, created_by, is_public, shuffle_questions, shuffle_answers, tags) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
        [title, description, duration, users[(qi % 3)], qi % 2, (qi + 1) % 2, (() => {
          const text = `${title} ${description}`.toLowerCase();
          const map = [["Docker", /docker|container|compose/], ["Linux", /linux|shell|systemd/], ["Mạng máy tính", /mạng|tcp|ip|dns|http|https|nginx/], ["Git", /git|commit|branch|rebase/], ["HTML/CSS", /html|css|responsive/], ["JavaScript", /javascript|node\.js|express|promise/], ["SQL", /sql|mysql|cơ sở dữ liệu|database/], ["API", /api|rest/], ["Bảo mật", /bảo mật|xác thực|phân quyền|https|tls/], ["DevOps", /devops|ci\/cd|prometheus|grafana|loki|cloud|vận hành/], ["Lập trình", /python|javascript|node|thuật toán|cấu trúc dữ liệu|lập trình/], ["Cơ bản", /cơ bản|nhập môn/]];
          const matched = map.filter(([, re]) => re.test(text)).map(([tag]) => tag);
          return (matched.length ? matched : ["Cơ bản"]).join(", ");
        })()]
      );
      const quizId = quizResult.insertId;
      for (let j = 0; j < 20; j++) {
        const [base, correctText] = qTemplates[(j + qi) % qTemplates.length];
        const questionText = base.replace("{topic}", title);
        const [questionResult] = await conn.query(
          "INSERT INTO questions(quiz_id, content, qtype) VALUES (?, ?, 'single')",
          [quizId, `Câu ${String(j + 1).padStart(2, "0")}: ${questionText} (${title})`]
        );
        const qid = questionResult.insertId;
        const correctIndex = (j + qi) % 4;
        const options = [];
        for (let k = 0; k < 4; k++) {
          options.push(k === correctIndex ? correctText : distractors[(k + j + qi) % distractors.length]);
        }
        for (let k = 0; k < options.length; k++) {
          await conn.query(
            "INSERT INTO answers(question_id, content, is_correct, sort_order) VALUES (?, ?, ?, ?)",
            [qid, options[k], k === correctIndex ? 1 : 0, k]
          );
        }
      }
    }
    await conn.commit();
    const [[counts]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role='ADMIN') AS admins,
      (SELECT COUNT(*) FROM users WHERE role='STUDENT') AS students,
      (SELECT COUNT(*) FROM quizzes) AS quizzes,
      (SELECT COUNT(*) FROM questions) AS questions,
      (SELECT COUNT(*) FROM answers) AS answers`);
    console.log("Seed completed:", counts);
    console.log("Demo password for all 40 accounts:", password);
    console.log("Admin usernames: admin1, admin2, admin3");
    console.log("Student usernames: student01 ... student37");
  } catch (err) {
    await conn.rollback();
    console.error("Seed failed; transaction rolled back where possible:", err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}
main().catch(err => { console.error(err); process.exit(1); });
