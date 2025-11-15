const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword } = require('../utils/hash');

// Middleware weryfikujący rolę admina
function isAdmin(req, res, next) {
  const role = req.headers['role'];
  if (role !== 'admin') return res.status(403).json({ message: "Brak dostępu" });
  next();
}

// Pobierz listę użytkowników
router.get('/users', isAdmin, (req, res) => {
  db.all("SELECT id, username, fullName, role, blocked, passwordExpiry FROM users", [], (err, rows) => {
    res.json(rows);
  });
});

// Dodaj nowego użytkownika
router.post('/add-user', isAdmin, async (req, res) => {
  const { username, fullName, password, role } = req.body;
  const passwordHash = await hashPassword(password);
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  db.run("INSERT INTO users (username, fullName, passwordHash, role, passwordExpiry) VALUES (?, ?, ?, ?, ?)",
    [username, fullName, passwordHash, role, expiryDate.toISOString()],
    function(err) {
      if (err) return res.status(400).json({ message: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Modyfikacja użytkownika
router.put('/update-user/:id', isAdmin, async (req, res) => {
  const { fullName, password, blocked, passwordExpiry } = req.body;
  let query = "UPDATE users SET fullName = ?, blocked = ?, passwordExpiry = ? ";
  const params = [fullName, blocked ? 1 : 0, passwordExpiry];

  if (password) {
    const passwordHash = await hashPassword(password);
    query += ", passwordHash = ? ";
    params.push(passwordHash);
  }

  query += "WHERE id = ?";
  params.push(req.params.id);

  db.run(query, params, function(err) {
    if (err) return res.status(400).json({ message: err.message });
    res.json({ message: "Użytkownik zaktualizowany" });
  });
});

// Usuń użytkownika
router.delete('/delete-user/:id', isAdmin, (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(400).json({ message: err.message });
    res.json({ message: "Użytkownik usunięty" });
  });
});

module.exports = router;
