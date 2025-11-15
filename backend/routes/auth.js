const express = require('express');
const router = express.Router();
const db = require('../db');
const { comparePassword, hashPassword } = require('../utils/hash');
const jwt = require('jsonwebtoken');

const SECRET = 'secretKey123'; // W produkcji należy użyć env

// Logowanie
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.status(401).json({ message: "Login lub Hasło niepoprawny" });

    if (user.blocked) return res.status(403).json({ message: "Konto zablokowane" });

    const match = await comparePassword(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: "Login lub Hasło niepoprawny" });

    // Sprawdzenie ważności hasła
    const now = new Date();
    if (user.passwordExpiry && new Date(user.passwordExpiry) < now) {
      return res.json({ message: "Password expired", requireChange: true });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
    res.json({ token, role: user.role });
  });
});

// Zmiana hasła
router.post('/change-password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.status(404).json({ message: "Użytkownik nie znaleziony" });
    const match = await comparePassword(oldPassword, user.passwordHash);
    if (!match) return res.status(401).json({ message: "Stare hasło niepoprawne" });

    const newHash = await hashPassword(newPassword);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // np. 30 dni ważności

    db.run("UPDATE users SET passwordHash = ?, passwordExpiry = ? WHERE username = ?", 
      [newHash, expiryDate.toISOString(), username], () => res.json({ message: "Hasło zmienione" }));
  });
});

module.exports = router;
