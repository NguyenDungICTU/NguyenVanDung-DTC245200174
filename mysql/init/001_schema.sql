SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS quiz_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE quiz_db;

ALTER DATABASE quiz_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quizzes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (quiz_id)
        REFERENCES quizzes(id)
        ON DELETE CASCADE
);

CREATE TABLE answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    content VARCHAR(500) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE CASCADE
);

CREATE TABLE attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    user_id INT NOT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id)
        REFERENCES quizzes(id),
    FOREIGN KEY (user_id)
        REFERENCES users(id)
);

INSERT INTO users
    (full_name, email, password_hash, role)
VALUES
    (
        'Administrator',
        'admin@quiz.local',
        'demo-password',
        'ADMIN'
    ),
    (
        'Nguyen Van Dung',
        'student@quiz.local',
        'demo-password',
        'STUDENT'
    );

INSERT INTO quizzes
    (title, description, duration_minutes)
VALUES
    (
        'Kiến thức Docker cơ bản',
        'Bài kiểm tra kiến thức Docker dành cho sinh viên CNTT.',
        30
    );

INSERT INTO questions
    (quiz_id, content)
VALUES
    (1, 'Docker container là gì?'),
    (1, 'Docker Compose dùng để làm gì?'),
    (1, 'Docker image dùng để làm gì?'),
    (1, 'Volume trong Docker dùng để làm gì?'),
    (1, 'Lệnh nào dùng để chạy container?');

INSERT INTO answers
    (question_id, content, is_correct)
VALUES
    (1, 'Một môi trường chạy ứng dụng được cô lập', TRUE),
    (1, 'Một hệ điều hành mới', FALSE),
    (1, 'Một trình duyệt web', FALSE),
    (1, 'Một cơ sở dữ liệu', FALSE),

    (2, 'Quản lý nhiều service/container bằng file cấu hình', TRUE),
    (2, 'Chỉ dùng để tạo database', FALSE),
    (2, 'Chỉ dùng để viết JavaScript', FALSE),
    (2, 'Dùng để thay thế Git', FALSE),

    (3, 'Mẫu bất biến dùng để tạo container', TRUE),
    (3, 'Một container đang chạy', FALSE),
    (3, 'Một network', FALSE),
    (3, 'Một volume', FALSE),

    (4, 'Lưu trữ dữ liệu bền vững ngoài vòng đời container', TRUE),
    (4, 'Tăng tốc CPU', FALSE),
    (4, 'Tạo HTTPS', FALSE),
    (4, 'Thay thế Dockerfile', FALSE),

    (5, 'docker run', TRUE),
    (5, 'docker start-image', FALSE),
    (5, 'docker execute-image', FALSE),
    (5, 'docker launch', FALSE);
