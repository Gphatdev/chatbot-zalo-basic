import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

/**
 * App/Database.js
 *
 * SQLite nhẹ dùng sql.js (WASM, không cần native build/MySQL).
 * sql.js chạy hoàn toàn trong bộ nhớ; ta tự đọc/ghi file .db trên đĩa và
 * debounce việc ghi để tránh ghi file quá dày khi có nhiều mutation liên tiếp.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  name TEXT,
  first_seen INTEGER,
  last_seen INTEGER,
  is_banned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groups (
  thread_id TEXT PRIMARY KEY,
  name TEXT,
  first_seen INTEGER,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  thread_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (thread_id, key)
);

CREATE TABLE IF NOT EXISTS command_stats (
  command_name TEXT PRIMARY KEY,
  uses INTEGER DEFAULT 0,
  last_used_at INTEGER
);
`;

async function createDatabase(dbPath, logger, flushDebounceMs = 1500) {
  const SQL = await initSqlJs();

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(SCHEMA);

  let flushTimer = null;
  let dirty = false;

  function flushNow() {
    try {
      const data = sqlDb.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
      dirty = false;
    } catch (err) {
      logger.error("[Database] Lỗi khi flush database:", { message: err?.message });
    }
  }

  function scheduleFlush() {
    dirty = true;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (dirty) flushNow();
    }, flushDebounceMs);
  }

  /**
   * Chạy một câu SQL. Tự nhận biết SELECT (trả về mảng row object) hay
   * mutation (INSERT/UPDATE/DELETE, trả về { changes }).
   * Luôn dùng parameter binding — không nối input người dùng vào chuỗi SQL.
   */
  function query(sql, params = []) {
    const trimmed = sql.trim().toUpperCase();
    const isSelect = trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA");

    if (isSelect) {
      const stmt = sqlDb.prepare(sql);
      try {
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        return rows;
      } finally {
        stmt.free();
      }
    }

    sqlDb.run(sql, params);
    scheduleFlush();
    return { changes: sqlDb.getRowsModified() };
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushNow();
  }

  return { query, flush };
}

export { createDatabase, SCHEMA };
