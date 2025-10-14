const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/users.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT UNIQUE,
    username TEXT,
    password TEXT,
    score INTEGER DEFAULT 0
  )`);
});

module.exports = db;
