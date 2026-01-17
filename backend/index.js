const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = 3001;
const SECRET_KEY = process.env.JWT_SECRET;

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./security.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    min_length INTEGER DEFAULT 14,
    require_digit BOOLEAN DEFAULT 1,
    require_special_char BOOLEAN DEFAULT 0,
    require_mixed_case BOOLEAN DEFAULT 0,
    validity_days INTEGER DEFAULT 30
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    is_blocked BOOLEAN DEFAULT 0,
    must_change_password BOOLEAN DEFAULT 1,
    last_password_change DATETIME DEFAULT CURRENT_TIMESTAMP,
    previous_passwords TEXT DEFAULT '[]',
    failed_attempts INTEGER DEFAULT 0, -- NOWE: licznik nieudanych prób
    lockout_until DATETIME DEFAULT NULL -- NOWE: czas blokady
  )`);

    db.get("SELECT * FROM settings", (err, row) => {
        if (!row) {
            db.run("INSERT INTO settings (min_length, require_digit, require_special_char, require_mixed_case, validity_days) VALUES (14, 1, 0, 0, 30)");
        }
    });

    db.get("SELECT * FROM users WHERE username = 'ADMIN'", async(err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run("INSERT INTO users (username, password, role, must_change_password, previous_passwords) VALUES (?, ?, ?, ?, ?)", ['ADMIN', hash, 'admin', 0, JSON.stringify([hash])]);
        }
    });
});

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).send({ message: 'Brak tokenu' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).send({ message: 'Nieautoryzowany' });
        req.userId = decoded.id;
        req.userRole = decoded.role;
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

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const MAX_ATTEMPTS = 3;
    const LOCKOUT_TIME = 5 * 60 * 1000; // 5 minut w milisekundach

    db.get("SELECT * FROM users WHERE username = ?", [username], async(err, user) => {
        // 1. Ochrona przed enumeracją (nie mówimy czy user istnieje, jeśli błąd bazy)
        if (err) return res.status(500).json({ message: "Błąd serwera" });
        if (!user) return res.status(401).json({ message: "Login lub Hasło niepoprawny" }); // Generyczny komunikat

        // 2. Sprawdzenie blokady administracyjnej (is_blocked)
        if (user.is_blocked) return res.status(403).json({ message: "Konto zostało zablokowane przez Administratora." });

        // 3. Sprawdzenie blokady czasowej (Brute-Force protection)
        if (user.lockout_until) {
            const lockoutDate = new Date(user.lockout_until);
            if (lockoutDate > new Date()) {
                return res.status(403).json({
                    message: `Konto tymczasowo zablokowane z powodu zbyt wielu prób. Spróbuj ponownie o ${lockoutDate.toLocaleTimeString()}`
                });
            }
        }

        // 4. Weryfikacja hasła
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            // Logika inkrementacji nieudanych prób
            let newAttempts = (user.failed_attempts || 0) + 1;
            let newLockout = null;

            if (newAttempts >= MAX_ATTEMPTS) {
                newLockout = new Date(Date.now() + LOCKOUT_TIME).toISOString();
            }

            db.run("UPDATE users SET failed_attempts = ?, lockout_until = ? WHERE id = ?", [newAttempts, newLockout, user.id],
                () => {
                    if (newLockout) {
                        return res.status(403).json({ message: "Zbyt wiele nieudanych prób logowania. Konto zablokowane na 5 minut." });
                    }
                    return res.status(401).json({ message: "Login lub Hasło niepoprawny" });
                }
            );
            return; // Stop execution
        }

        // 5. Sukces logowania - reset liczników
        // Jeśli zablokowany czasowo minął, a hasło jest poprawne -> resetujemy blokadę
        db.run("UPDATE users SET failed_attempts = 0, lockout_until = NULL WHERE id = ?", [user.id]);

        db.get("SELECT * FROM settings", (err, settings) => {
            const daysSinceChange = (new Date() - new Date(user.last_password_change)) / (1000 * 60 * 60 * 24);
            const isExpired = daysSinceChange > settings.validity_days;

            const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
            res.json({ token, role: user.role, mustChange: user.must_change_password || isExpired });
        });
    });
});

app.post('/change-password', verifyToken, (req, res) => {
    const { newPassword } = req.body;
    const userId = req.userId;

    db.get("SELECT * FROM settings", (err, settings) => {
        if (!validatePassword(newPassword, settings)) {
            let reqs = [`min. ${settings.min_length} znaków`];
            if (settings.require_digit) reqs.push("cyfrę");
            if (settings.require_special_char) reqs.push("znak specjalny");
            if (settings.require_mixed_case) reqs.push("małe i wielkie litery");

            return res.status(400).json({ message: `Hasło nie spełnia wymagań: ${reqs.join(', ')}.` });
        }

        db.get("SELECT * FROM users WHERE id = ?", [userId], async(err, user) => {
            const prevPasswords = JSON.parse(user.previous_passwords || '[]');

            for (let oldHash of prevPasswords) {
                if (await bcrypt.compare(newPassword, oldHash)) {
                    return res.status(400).json({ message: "Hasło musi być inne niż poprzednie" });
                }
            }

            const newHash = await bcrypt.hash(newPassword, 10);
            prevPasswords.push(newHash);

            db.run(`UPDATE users SET password = ?, must_change_password = 0, last_password_change = CURRENT_TIMESTAMP, previous_passwords = ? WHERE id = ?`, [newHash, JSON.stringify(prevPasswords), userId],
                (err) => {
                    if (err) return res.status(500).send();
                    res.json({ message: "Hasło zmienione" });
                }
            );
        });
    });
});

app.get('/users', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    db.all("SELECT id, username, role, is_blocked, last_password_change FROM users", (err, rows) => {
        res.json(rows);
    });
});

app.post('/users', verifyToken, async(req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    const { username, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, password, role, previous_passwords) VALUES (?, ?, ?, ?)", [username, hash, role || 'user', JSON.stringify([hash])],
        function(err) {
            if (err) return res.status(400).json({ message: "Użytkownik istnieje" });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/users/:id', verifyToken, async(req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    const { is_blocked, password, username } = req.body;

    const updates = [];
    const params = [];

    if (is_blocked !== undefined) {
        updates.push("is_blocked = ?");
        params.push(is_blocked);
    }

    if (username) {
        updates.push("username = ?");
        params.push(username);
    }

    if (password && password.trim() !== "") {
        const hash = await bcrypt.hash(password, 10);
        updates.push("password = ?");
        updates.push("must_change_password = 1");
        params.push(hash);
    }

    if (updates.length === 0) return res.json({ success: true });

    params.push(req.params.id);

    const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;

    db.run(sql, params, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ message: "Nazwa użytkownika jest już zajęta" });
            }
            return res.status(500).json({ message: "Błąd bazy danych" });
        }
        res.json({ success: true });
    });
});

app.delete('/users/:id', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
        res.json({ success: true });
    });
});

app.get('/settings', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    db.get("SELECT * FROM settings", (err, row) => res.json(row));
});

app.put('/settings', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).send();
    const { min_length, require_digit, require_special_char, require_mixed_case, validity_days } = req.body;
    db.run("UPDATE settings SET min_length=?, require_digit=?, require_special_char=?, require_mixed_case=?, validity_days=?", [min_length, require_digit, require_special_char, require_mixed_case, validity_days],
        () => res.json({ success: true })
    );
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
