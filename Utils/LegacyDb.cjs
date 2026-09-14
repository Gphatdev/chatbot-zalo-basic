/**
 * Utils/LegacyDb.cjs
 *
 * Lớp cơ sở dữ liệu "di sản" (legacy) — port nguyên bản từ NKNP (better-sqlite3),
 * dùng riêng cho các command được chuyển từ NKNP sang (Users / Threads / Currencies).
 * Được giữ tách biệt với App/Database.js (sql.js) của EMPHAT để không đụng chạm
 * tới hệ thống gốc của EMPHAT — hai DB độc lập, mỗi bên lo phần của mình.
 *
 * File .db thật nằm tại Data/legacy/nknp-legacy.db
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "Data", "legacy", "nknp-legacy.db");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS Threads (
    threadId TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS Users (
    userId TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS Currencies (
    userId TEXT PRIMARY KEY,
    data TEXT
  );
`);

function getData(table, idField, id) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${idField} = ?`).get(id);
  return {
    ...row,
    data: row && row.data ? JSON.parse(row.data) : {},
  };
}

function saveData(table, idField, id, dataObj, extra = {}) {
  const json = JSON.stringify(dataObj);
  const fields = Object.keys(extra).concat(["data"]);
  const values = Object.values(extra).concat([json]);
  const placeholders = fields.map(() => "?").join(", ");
  const updateSet = fields.map((f) => `${f} = ?`).join(", ");

  db.prepare(
    `INSERT INTO ${table} (${idField}, ${fields.join(", ")}) VALUES (?, ${placeholders})
     ON CONFLICT(${idField}) DO UPDATE SET ${updateSet}`
  ).run(id, ...values, ...values);
}

module.exports = { getData, saveData, db };
