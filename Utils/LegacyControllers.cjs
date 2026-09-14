/**
 * Utils/LegacyControllers.cjs
 *
 * Controller Users / Threads — port gần như nguyên bản từ NKNP
 * (core/controller/controllerUsers.js & controllerThreads.js), chỉ đổi
 * nguồn cấu hình mặc định (global.NKNP_CONFIG thay vì global.config để
 * tránh xung đột với biến global.config gốc của legacy bridge — nhưng vì
 * LegacyBridge luôn set cả hai nên giữ global.config cho an toàn).
 */
const { getData, saveData, db } = require("./LegacyDb.cjs");

const Users = {
  getAll: () => {
    const rows = db.prepare("SELECT * FROM Users").all();
    return rows.map((row) => ({ userId: row.userId, data: JSON.parse(row.data || "{}") }));
  },
  getData: (userId) => {
    const existing = db.prepare("SELECT 1 FROM Users WHERE userId = ?").get(userId);
    if (!existing) {
      Users.createData(userId, { ban: false, money: (global.config && global.config.default_money) || 0 });
    }
    return getData("Users", "userId", userId);
  },
  setData: (userId, data) => saveData("Users", "userId", userId, data),
  delData: (userId) => {
    const exists = db.prepare("SELECT 1 FROM Users WHERE userId = ?").get(userId);
    if (exists) db.prepare("DELETE FROM Users WHERE userId = ?").run(userId);
  },
  createData: (userId, defaultData = {}) => {
    const existing = db.prepare("SELECT 1 FROM Users WHERE userId = ?").get(userId);
    if (!existing) saveData("Users", "userId", userId, defaultData);
  },
};

const Threads = {
  getAll: () => {
    const rows = db.prepare("SELECT * FROM Threads").all();
    return rows.map((row) => ({ threadId: row.threadId, data: JSON.parse(row.data || "{}") }));
  },
  getData: async (threadId) => {
    const existing = db.prepare("SELECT 1 FROM Threads WHERE threadId = ?").get(threadId);
    if (!existing) {
      Threads.createData(threadId, {
        ban: false,
        admin_only: false,
        support_only: false,
        box_only: false,
        prefix: (global.config && global.config.prefix) || "!",
      });
    }
    return getData("Threads", "threadId", threadId);
  },
  setData: (threadId, data) => saveData("Threads", "threadId", threadId, data),
  delData: (threadId) => {
    const exists = db.prepare("SELECT 1 FROM Threads WHERE threadId = ?").get(threadId);
    if (exists) db.prepare("DELETE FROM Threads WHERE threadId = ?").run(threadId);
  },
  createData: (threadId, defaultData = {}) => {
    const existing = db.prepare("SELECT 1 FROM Threads WHERE threadId = ?").get(threadId);
    if (!existing) saveData("Threads", "threadId", threadId, defaultData);
  },
};

module.exports = { Users, Threads };
