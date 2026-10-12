-- MySQL exporter account for this local lab.
-- Runs automatically only when MySQL initializes an EMPTY data volume.
-- If changing the password, update monitoring/.my.cnf as well.
CREATE USER IF NOT EXISTS 'exporter'@'%' IDENTIFIED BY 'exporter_password';
GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO 'exporter'@'%';
FLUSH PRIVILEGES;
