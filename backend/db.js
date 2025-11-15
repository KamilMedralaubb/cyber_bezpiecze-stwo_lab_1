const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./security.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    fullName TEXT,
    passwordHash TEXT,
    role TEXT,
    blocked INTEGER DEFAULT 0,
    passwordExpiry DATE,
    previousPasswords TEXT
  )`);

  // Dodanie konta ADMIN jeśli nie istnieje
  db.get("SELECT * FROM users WHERE username = 'ADMIN'", (err, row) => {
    if (!row) {
      const bcrypt = require('bcrypt');
      const defaultPassword = 'Admin123!';
      bcrypt.hash(defaultPassword, 10, (err, hash) => {
        db.run(`INSERT INTO users (username, fullName, passwordHash, role) VALUES (?, ?, ?, ?)`,
          ['ADMIN', 'Administrator', hash, 'admin']);
      });
    }
  });
});

module.exports = db;
