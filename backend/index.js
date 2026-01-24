const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = 3001;
const SECRET_KEY = process.env.JWT_SECRET || 'super_tajny_klucz_z_laborki';

app.use(cors());
app.use(bodyParser.json());

// Magazyn w pamięci na sesje CAPTCHA (id -> poprawne indeksy)
const captchaStore = new Map();

const db = new sqlite3.Database('./security.db');

// --- BAZA DANYCH ---
db.serialize(() => {
  // Tabela ustawień (Lab 2 + Lab 4)
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    min_length INTEGER DEFAULT 8,
    require_digit BOOLEAN DEFAULT 1,
    require_special_char BOOLEAN DEFAULT 0,
    require_mixed_case BOOLEAN DEFAULT 0,
    validity_days INTEGER DEFAULT 30,
    max_failed_attempts INTEGER DEFAULT 3,
    session_timeout_minutes INTEGER DEFAULT 15
  )`);

  // Tabela użytkowników (Lab 1 + Lab 2)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    is_blocked BOOLEAN DEFAULT 0,
    must_change_password BOOLEAN DEFAULT 1,
    last_password_change DATETIME DEFAULT CURRENT_TIMESTAMP,
    previous_passwords TEXT DEFAULT '[]',
    failed_attempts INTEGER DEFAULT 0,
    lockout_until DATETIME DEFAULT NULL
  )`);

  // Tabela logów (Lab 4)
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    action TEXT,
    status TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Dane domyślne
  db.get("SELECT * FROM settings", (err, row) => {
    if (!row) {
      db.run("INSERT INTO settings (min_length, require_digit, require_special_char, require_mixed_case, validity_days, max_failed_attempts, session_timeout_minutes) VALUES (8, 1, 0, 0, 30, 3, 15)");
    }
  });

  db.get("SELECT * FROM users WHERE username = 'ADMIN'", async (err, row) => {
    if (!row) {
      const hash = await bcrypt.hash('admin123', 10);
      db.run("INSERT INTO users (username, password, role, must_change_password, previous_passwords) VALUES (?, ?, ?, ?, ?)", 
        ['ADMIN', hash, 'admin', 0, JSON.stringify([hash])]
      );
    }
  });
});

// --- HELPERY ---

// Funkcja logująca zdarzenia (Lab 4)
const logAction = (username, action, status, details = '') => {
  const stmt = db.prepare("INSERT INTO logs (username, action, status, details) VALUES (?, ?, ?, ?)");
  stmt.run(username || 'SYSTEM', action, status, details);
  stmt.finalize();
};

// Sprawdzanie wycieków haseł k-Anonymity (Lab 3)
const checkLeakedPassword = async (password) => {
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.substring(0, 5);
  const suffix = sha1.substring(5);
  try {
    const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`);
    return response.data.includes(suffix);
  } catch (error) { return false; }
};

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).send({ message: 'Brak tokenu' });
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).send({ message: 'Nieautoryzowany' });
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.username = decoded.username; 
    next();
  });
};

const validatePassword = (password, settings) => {
  if (password.length < settings.min_length) return false;
  if (settings.require_digit && !/\d/.test(password)) return false; 
  if (settings.require_special_char && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
  if (settings.require_mixed_case && (!/[a-z]/.test(password) || !/[A-Z]/.test(password))) return false;
  return true;
};

// --- IMAGE CAPTCHA CONFIG (Lab 3 Modified) ---
const IMAGE_POOL = [
    { type: 'sign', url: 'https://placehold.co/100x100/orange/white?text=ZNAK' },
    { type: 'sign', url: 'https://placehold.co/100x100/red/white?text=STOP' },
    { type: 'sign', url: 'https://placehold.co/100x100/blue/white?text=Parking' },
    { type: 'sign', url: 'https://placehold.co/100x100/yellow/black?text=Uwaga' },
    { type: 'animal', url: 'https://placehold.co/100x100/green/white?text=KOT' },
    { type: 'animal', url: 'https://placehold.co/100x100/green/white?text=PIES' },
    { type: 'tree', url: 'https://placehold.co/100x100/brown/white?text=DRZEWO' },
    { type: 'car', url: 'https://placehold.co/100x100/grey/white?text=AUTO' },
    { type: 'car', url: 'https://placehold.co/100x100/black/white?text=TAXI' }
];

// --- ENDPOINTY ---

app.get('/captcha', (req, res) => {
  const grid = [];
  const correctIndices = [];
  
  // Losujemy 9 obrazków
  for (let i = 0; i < 9; i++) {
      const randomImg = IMAGE_POOL[Math.floor(Math.random() * IMAGE_POOL.length)];
      grid.push({ id: i, url: randomImg.url });
      if (randomImg.type === 'sign') correctIndices.push(i);
  }

  const captchaId = Date.now().toString() + Math.random().toString();
  captchaStore.set(captchaId, correctIndices);
  setTimeout(() => captchaStore.delete(captchaId), 5 * 60 * 1000);

  res.json({ id: captchaId, task: "Kliknij wszystkie znaki drogowe", images: grid });
});

app.post('/login', (req, res) => {
  const { username, password, captchaId, selectedImages, rememberMe } = req.body;
  
  // 1. Weryfikacja CAPTCHA
  if (!captchaId || !selectedImages) return res.status(400).json({ message: "Weryfikacja obrazkowa wymagana" });
  
  const correctIndices = captchaStore.get(captchaId);
  if (!correctIndices) return res.status(400).json({ message: "Sesja CAPTCHA wygasła" });

  const userSet = selectedImages.sort((a, b) => a - b).toString();
  const serverSet = correctIndices.sort((a, b) => a - b).toString();

  if (userSet !== serverSet) {
    captchaStore.delete(captchaId);
    logAction(username, 'LOGIN', 'ERROR', 'Błąd CAPTCHA');
    return res.status(400).json({ message: "Błędnie zaznaczone obrazki" });
  }
  captchaStore.delete(captchaId);

  // 2. Weryfikacja Użytkownika
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) {
      logAction(username, 'LOGIN', 'ERROR', 'Nieznany użytkownik');
      return res.status(401).json({ message: "Login lub Hasło niepoprawny" }); 
    }

    if (user.is_blocked) {
      logAction(username, 'LOGIN', 'ERROR', 'Konto zablokowane admin.');
      return res.status(403).json({ message: "Konto zablokowane administracyjnie." });
    }

    if (user.lockout_until) {
      const lockoutDate = new Date(user.lockout_until);
      if (lockoutDate > new Date()) {
        logAction(username, 'LOGIN', 'ERROR', 'Blokada czasowa aktywna');
        return res.status(403).json({ 
          message: `Blokada. Spróbuj o ${lockoutDate.toLocaleTimeString()}` 
        });
      }
    }

    const validPassword = await bcrypt.compare(password, user.password);

    db.get("SELECT * FROM settings", async (err, settings) => {
        const MAX_ATTEMPTS = settings.max_failed_attempts || 3;
        const LOCKOUT_TIME = 15 * 60 * 1000; 

        if (!validPassword) {
            let newAttempts = (user.failed_attempts || 0) + 1;
            let newLockout = null;
            let msg = "Login lub Hasło niepoprawny";
            
            if (newAttempts >= MAX_ATTEMPTS) {
                newLockout = new Date(Date.now() + LOCKOUT_TIME).toISOString();
                msg = `Konto zablokowane na 15 minut.`;
                logAction(username, 'LOGIN', 'ERROR', `Blokada konta (Próba ${newAttempts})`);
            } else {
                logAction(username, 'LOGIN', 'ERROR', `Złe hasło (Próba ${newAttempts})`);
            }

            db.run("UPDATE users SET failed_attempts = ?, lockout_until = ? WHERE id = ?", 
                [newAttempts, newLockout, user.id]);
            return res.status(401).json({ message: msg });
        }

        // 3. Sukces Logowania
        db.run("UPDATE users SET failed_attempts = 0, lockout_until = NULL WHERE id = ?", [user.id]);
        
        const daysSinceChange = (new Date() - new Date(user.last_password_change)) / (1000 * 60 * 60 * 24);
        const isExpired = daysSinceChange > settings.validity_days;
        
        // Obsługa "Zapamiętaj mnie"
        let sessionTime = rememberMe ? '7d' : ((settings.session_timeout_minutes || 15) + 'm');

        const token = jwt.sign(
            { id: user.id, role: user.role, username: user.username }, 
            SECRET_KEY, 
            { expiresIn: sessionTime }
        );
        
        logAction(username, 'LOGIN', 'SUCCESS', `Zalogowano. RememberMe: ${rememberMe}`);
        res.json({ token, role: user.role, mustChange: user.must_change_password || isExpired });
    });
  });
});

app.post('/logout', verifyToken, (req, res) => {
    logAction(req.username, 'LOGOUT', 'SUCCESS', 'Wylogowano');
    res.json({ success: true });
});

app.get('/logs', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    db.all("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100", (err, rows) => res.json(rows));
});

// Reszta endpointów CRUD (Users, Settings, Password)
app.post('/change-password', verifyToken, async (req, res) => {
  const { newPassword } = req.body;
  if (await checkLeakedPassword(newPassword)) {
    logAction(req.username, 'CHANGE_PASS', 'ERROR', 'Hasło w wycieku');
    return res.status(400).json({ message: "⚠️ TO HASŁO WYCIEKŁO!" });
  }
  db.get("SELECT * FROM settings", (err, settings) => {
    if (!validatePassword(newPassword, settings)) return res.status(400).json({ message: `Hasło zbyt słabe.` });
    db.get("SELECT * FROM users WHERE id = ?", [req.userId], async (err, user) => {
      const prevPasswords = JSON.parse(user.previous_passwords || '[]');
      for (let oldHash of prevPasswords) {
        if (await bcrypt.compare(newPassword, oldHash)) return res.status(400).json({ message: "Hasło było już używane" });
      }
      const newHash = await bcrypt.hash(newPassword, 10);
      prevPasswords.push(newHash);
      db.run(`UPDATE users SET password = ?, must_change_password = 0, last_password_change = CURRENT_TIMESTAMP, previous_passwords = ? WHERE id = ?`,
        [newHash, JSON.stringify(prevPasswords), req.userId],
        (err) => {
            logAction(req.username, 'CHANGE_PASS', 'SUCCESS');
            res.json({ message: "Hasło zmienione" });
        }
      );
    });
  });
});

app.get('/users', verifyToken, (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).send();
  db.all("SELECT id, username, role, is_blocked, last_password_change FROM users", (err, rows) => res.json(rows));
});

app.post('/users', verifyToken, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).send();
  const { username, password, role } = req.body;
  if (await checkLeakedPassword(password)) return res.status(400).json({ message: "Hasło w wycieku!" });
  
  const hash = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (username, password, role, previous_passwords) VALUES (?, ?, ?, ?)", 
    [username, hash, role || 'user', JSON.stringify([hash])], 
    function(err) {
      if (err) return res.status(400).json({ message: "Użytkownik istnieje" });
      logAction(req.username, 'CREATE_USER', 'SUCCESS', `Dodano: ${username}`);
      res.json({ id: this.lastID });
    }
  );
});

app.put('/users/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    const { is_blocked, password, username, role } = req.body;
    const updates = [], params = [];
    if (is_blocked !== undefined) { updates.push("is_blocked = ?"); params.push(is_blocked); }
    if (username) { updates.push("username = ?"); params.push(username); }
    if (role) { updates.push("role = ?"); params.push(role); }
    if (password && password.trim() !== "") {
      if (await checkLeakedPassword(password)) return res.status(400).json({ message: "Hasło skompromitowane" });
      updates.push("password = ?", "must_change_password = 1"); params.push(await bcrypt.hash(password, 10));
    }
    if (updates.length === 0) return res.json({ success: true });
    params.push(req.params.id);
    db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params, (err) => {
        logAction(req.username, 'UPDATE_USER', 'SUCCESS', `ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.delete('/users/:id', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], () => {
        logAction(req.username, 'DELETE_USER', 'SUCCESS', `ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/settings', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    db.get("SELECT * FROM settings", (err, row) => res.json(row));
});

app.put('/settings', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    const { min_length, require_digit, require_special_char, require_mixed_case, validity_days, max_failed_attempts, session_timeout_minutes } = req.body;
    db.run("UPDATE settings SET min_length=?, require_digit=?, require_special_char=?, require_mixed_case=?, validity_days=?, max_failed_attempts=?, session_timeout_minutes=?",
      [min_length, require_digit, require_special_char, require_mixed_case, validity_days, max_failed_attempts, session_timeout_minutes],
      () => {
          logAction(req.username, 'SETTINGS', 'SUCCESS', 'Aktualizacja ustawień');
          res.json({ success: true });
      }
    );
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
