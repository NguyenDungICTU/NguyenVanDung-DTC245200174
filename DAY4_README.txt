DAY 4 PATCH - Prometheus, cAdvisor, mysqld_exporter, Grafana

Patch contents:
- docker-compose.yml: adds Prometheus, Grafana, cAdvisor and mysqld-exporter.
- monitoring/prometheus.yml: Prometheus scrape targets.
- monitoring/.my.cnf.example: demo template; copy to monitoring/.my.cnf.
- mysql/init/002_exporter.sql: creates the exporter user on first initialization of an empty MySQL volume.
- .gitignore: ignores monitoring/.my.cnf and local TLS keys/certificates.

IMPORTANT:
1. Do not use `docker compose down -v` unless you intentionally want to delete the database and monitoring data.
2. MySQL init scripts only run automatically when the MySQL data volume is empty. If you already have Day 2/3 data, run the CREATE USER/GRANT SQL manually in the existing database (instructions in chat).
3. Demo password is `exporter_password`; use it in both MySQL account and monitoring/.my.cnf. Change it for a real deployment.
4. Do not commit monitoring/.my.cnf, nginx/certs/quiz.key, or nginx/certs/quiz.crt.
5. Prometheus UI: http://localhost:9090; Grafana UI: http://localhost:3000 (initial login commonly admin/admin; change it at first login). App remains https://localhost.
6. cAdvisor host-level metrics can be limited on Docker Desktop for Windows; verify target status and available metrics in Prometheus.
