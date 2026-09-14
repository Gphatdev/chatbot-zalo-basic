/**
 * [PORT TỪ NKNP] td.js
 * Tự động chuyển đổi bởi codemod NKNP V3 — logic bên trong giữ nguyên vẹn,
 * chỉ thay đổi phần "vỏ bọc" (module.exports -> wrapLegacyCommand).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../LegacyBridge.js";

const moment = require("moment-timezone");
const fs = require("fs-extra");
const path = require("path");
const { createCanvas, loadImage, registerFont } = require("canvas");

const FFRANK_PATH = path.join(__dirname, "ffrank");
const garenaApi = require(path.join(FFRANK_PATH, "api.js"));
const TIME_ZONE = "Asia/Ho_Chi_Minh";

const dataRoot = path.join(__dirname, "data");
const fontsPath = path.join(dataRoot, "fonts");
const bxhRoot = path.join(dataRoot, "FREEFIRE");
const layoutsRoot = path.join(bxhRoot, "layouts");
const keysPath = path.join(dataRoot, "keys.json");
const limitPath = path.join(__dirname, "..", "commands", "cache", "limit.json");

const turnsFilePath = path.join(__dirname, "data", "Luotdung", "bank_user_turns.json");
const vohanFilePath = path.join(__dirname, "data", "Luotdung", "tinhdiem_vohan.json");
const vohanBoxFilePath = path.join(__dirname, "data", "Luotdung", "vohan_box.json");

fs.ensureDirSync(dataRoot);
fs.ensureDirSync(fontsPath);
fs.ensureDirSync(bxhRoot);
fs.ensureDirSync(layoutsRoot);
fs.ensureDirSync(path.join(__dirname, "data", "Luotdung"));

fs.ensureFileSync(turnsFilePath);
fs.ensureFileSync(vohanFilePath);
fs.ensureFileSync(vohanBoxFilePath);

// Nếu file rỗng thì khởi tạo {}
for (const fp of [turnsFilePath, vohanFilePath, vohanBoxFilePath]) {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    if (!raw || !raw.trim()) fs.writeFileSync(fp, "{}");
  } catch {
    fs.writeFileSync(fp, "{}");
  }
}

fs.readdirSync(fontsPath)
  .filter((f) => f.endsWith(".ttf") || f.endsWith(".otf"))
  .forEach((f) => {
    const fontFile = path.join(fontsPath, f);
    const fontName = path.basename(f, path.extname(f));
    try {
      registerFont(fontFile, { family: fontName });
      console.log("✅ Loaded font:", fontName);
    } catch (err) {
      console.error("❌ Lỗi load font:", f, err.message);
    }
  });

const TIME_SLOTS = {
  1: ["13:00", "15:00"],
  2: ["15:00", "17:00"],
  3: ["18:00", "20:00"],
  4: ["20:00", "21:50"],
  5: ["21:40", "23:30"],
  6: ["23:00", "01:00"],
  7: ["01:00", "03:00"],
  8: ["10:00", "12:00"],
};

const REPLY_NAME = "td";

// ============================================================
// 🆕 Zalo (zca-js) reply-state store
// Zalo không có handleReply gốc như FCA. Ta lưu state theo msgId
// của tin nhắn hỏi chọn khung giờ, và đối chiếu khi có tin nhắn
// "quote/reply" tới msgId đó (event.data.quote.globalMsgId hoặc
// event.data.quote.cliMsgId tùy phiên bản zca-js).
// ============================================================
global.client = global.client || {};
global.client.handleReply = global.client.handleReply instanceof Map
  ? global.client.handleReply
  : new Map();

function pad2(n) {
  return String(n || 0).padStart(2, "0");
}

// ============================================================
// 🆕 XOÁ TIN NHẮN (thu hồi) - đúng theo API thực tế của zca-js:
// api.deleteMessage({ data: { cliMsgId, msgId, uidFrom }, threadId, type })
// ============================================================
async function tryDeleteMessage(api, { cliMsgId, msgId, uidFrom }, threadId, type) {
  if (!api || typeof api.deleteMessage !== "function") return false;
  if (!cliMsgId && !msgId) return false;
  try {
    await api.deleteMessage({
      data: { cliMsgId, msgId, uidFrom },
      threadId,
      type
    });
    return true;
  } catch (e) {
    console.error("⚠️ [td] Lỗi thu hồi tin nhắn:", e.message);
    return false;
  }
}

function parseXoaToken(tokens) {
  if (!Array.isArray(tokens)) return null;
  for (const t of tokens) {
    if (typeof t !== "string") continue;
    const token = t.trim();
    const m = /^xoa\s*([\d,\s]+)$/i.exec(token);
    if (m) {
      return m[1]
        .split(",")
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 1);
    }
  }
  return null;
}

function parseKeyToken(tokens) {
  if (!Array.isArray(tokens)) return null;
  for (const t of tokens) {
    if (typeof t !== "string") continue;
    const token = t.trim();
    if (!token) continue;
    if (/^xoa[\d,\s]+$/i.test(token)) continue;
    if (/^cpr\d+$/i.test(token)) continue;
    if (/^\d{1,2}:\d{2}$/.test(token) || /^\d{2}\/\d{2}\/\d{4}$/.test(token)) continue;
    if (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(token)) continue;
    return token;
  }
  return null;
}

function parseCprToken(tokens) {
  for (const t of tokens) {
    const m = /^cpr(\d+)$/i.exec(t);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function formatCustomTime(m) {
  return m.tz(TIME_ZONE).format("DD/MM HH:mm");
}
function formatCustomTime1(m) {
  return m.tz(TIME_ZONE).format("HH:mm DD/MM");
}
function formatCustomTime2(m) {
  return m.tz(TIME_ZONE).format("HH:mm");
}
function formatCustomTime3(m) {
  return m.tz(TIME_ZONE).format("DD/MM");
}

function parseShortTimeRange(accountId, tail) {
  if (tail.length >= 1 && /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(tail[0].trim())) {
    const parts = tail[0].trim().split("-");
    return buildShortRange(parts[0], parts[1]);
  }
  if (
    tail.length >= 2 &&
    /^\d{1,2}:\d{2}$/.test(tail[0].trim()) &&
    /^\d{1,2}:\d{2}$/.test(tail[1].trim())
  ) {
    return buildShortRange(tail[0].trim(), tail[1].trim());
  }
  return null;
}

function buildShortRange(startTimeStr, endTimeStr) {
  const today = moment().tz(TIME_ZONE);
  const dateStr = today.format("DD/MM/YYYY");
  const start = moment.tz(`${dateStr} ${startTimeStr}`, "DD/MM/YYYY HH:mm", TIME_ZONE);
  let end = moment.tz(`${dateStr} ${endTimeStr}`, "DD/MM/YYYY HH:mm", TIME_ZONE);
  if (!start.isValid() || !end.isValid()) return null;
  if (end.isBefore(start)) end.add(1, "day");
  return { start, end };
}

/**
 * Parse full datetime range: "10/07/2026 18:00 10/07/2026 20:00"
 */
function parseFullTimeArgs(args) {
  const accountId = args[0];
  const tail = args.slice(1);
  if (tail.length < 4) throw new Error("❌ Thiếu thông tin start/end thời gian.");

  const normalizeDateTime = (inputDate, inputTime) => {
    let [d, m, y] = inputDate.split("/").map((s) => s.trim());
    if (!d || !m || !y) throw new Error(`Ngày không hợp lệ: "${inputDate}"`);
    d = parseInt(d, 10); m = parseInt(m, 10); y = parseInt(y, 10);
    if (!(d >= 1 && d <= 31)) throw new Error(`Ngày phải từ 1-31`);
    if (!(m >= 1 && m <= 12)) throw new Error(`Tháng phải từ 1-12`);
    if (!/^\d{4}$/.test(String(y))) throw new Error(`Năm phải đủ 4 chữ số`);

    const dd = d < 10 ? "0" + d : String(d);
    const mm = m < 10 ? "0" + m : String(m);
    const yyyy = String(y);

    let hh = null, min = null;
    let timeStr = inputTime.trim();
    if (/^\d{1,2}h\d{1,2}$/.test(timeStr)) {
      [hh, min] = timeStr.split("h").map((n) => parseInt(n, 10));
    } else if (/^\d{1,2}h$/.test(timeStr)) {
      hh = parseInt(timeStr.replace("h", ""), 10); min = 0;
    } else if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
      [hh, min] = timeStr.split(":").map((n) => parseInt(n, 10));
    } else {
      throw new Error(`Format giờ không hợp lệ: "${inputTime}"`);
    }
    if (!(hh >= 0 && hh <= 23)) throw new Error(`Giờ phải từ 0-23`);
    if (!(min >= 0 && min <= 59)) throw new Error(`Phút phải từ 0-59`);

    const HH = hh < 10 ? "0" + hh : String(hh);
    const MM = min < 10 ? "0" + min : String(min);
    return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
  };

  let startStr, endStr;
  try {
    startStr = normalizeDateTime(tail[0], tail[1]);
    endStr = normalizeDateTime(tail[2], tail[3]);
  } catch (err) {
    throw new Error(`❌ Lỗi khung giờ: ${err.message}`);
  }

  const start = moment.tz(startStr, "DD/MM/YYYY HH:mm", TIME_ZONE);
  const end = moment.tz(endStr, "DD/MM/YYYY HH:mm", TIME_ZONE);
  if (!start.isValid()) throw new Error(`❌ Thời gian bắt đầu không hợp lệ`);
  if (!end.isValid()) throw new Error(`❌ Thời gian kết thúc không hợp lệ`);
  if (start.isSameOrAfter(end)) throw new Error(`❌ Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc`);

  const extraTokens = tail.slice(4);
  const xoaN = parseXoaToken(extraTokens);
  const key = parseKeyToken(extraTokens) || "NKNP";
  const cpr = parseCprToken(extraTokens);
  const mode = cpr ? "cpr" : "normal";

  return { accountId, start, end, key, xoaN, mode, cprThreshold: cpr };
}

function computeStartEndFromToday(slotId) {
  const [s, e] = TIME_SLOTS[slotId];
  if (!s || !e) return null;
  const today = moment().tz(TIME_ZONE);
  const start = moment.tz(`${today.format("DD/MM/YYYY")} ${s}`, "DD/MM/YYYY HH:mm", TIME_ZONE);
  let end = moment.tz(`${today.format("DD/MM/YYYY")} ${e}`, "DD/MM/YYYY HH:mm", TIME_ZONE);
  if (end.isBefore(start)) end.add(1, "day");
  return { start, end };
}

function ensureKeysConfig() {
  if (!fs.existsSync(keysPath)) {
    fs.writeFileSync(
      keysPath,
      JSON.stringify(
        { NKNP: { ct: "SCO RING", ct2: "NKNP", idbang: "lg1", logo: "", admins: [], ctvs: [] } },
        null, 2
      )
    );
  }
  try {
    return JSON.parse(fs.readFileSync(keysPath, "utf8"));
  } catch (e) {
    throw new Error("keys.json bị lỗi JSON: " + e.message);
  }
}

async function loadLayoutById(idbang) {
  const layoutDir = path.join(layoutsRoot, idbang);
  const layoutJson = path.join(layoutDir, "layout.json");
  const bgPath = path.join(layoutDir, "background.png");
  if (!fs.existsSync(layoutJson)) throw new Error(`Không tìm thấy layout.json cho layout "${idbang}"`);
  if (!fs.existsSync(bgPath)) throw new Error(`Không tìm thấy background.png cho layout "${idbang}"`);
  const layoutConf = JSON.parse(fs.readFileSync(layoutJson, "utf8"));
  const bgImg = await loadImage(bgPath);
  return { layoutDir, layoutConf, bgImg };
}

function applyText(ctx, cfg, text) {
  if (!cfg || typeof text === "undefined" || text === null) return;
  ctx.save();
  if (cfg.rotate) {
    const centerX = cfg.x || 0;
    const centerY = cfg.y || 0;
    ctx.translate(centerX, centerY);
    ctx.rotate((cfg.rotate * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }
  ctx.fillStyle = cfg.color || "#FFF";
  ctx.textAlign = cfg.align || "left";
  ctx.font = `${cfg.bold ? "bold " : ""}${cfg.size || 22}px ${cfg.font || "Arial"}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(text), cfg.x || 0, cfg.y || 0);
  ctx.restore();
}

async function drawLogo(ctx, cfg, logoPath) {
  if (!cfg || !logoPath) return;
  try {
    const logo = await loadImage(logoPath);
    const tempCanvas = createCanvas(logo.width, logo.height);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(logo, 0, 0);
    if (cfg.removeBackground) {
      const imageData = tempCtx.getImageData(0, 0, logo.width, logo.height);
      const data = imageData.data;
      const targetColor = cfg.backgroundColor || { r: 255, g: 255, b: 255 };
      const tolerance = cfg.tolerance || 30;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const colorDiff = Math.abs(r - targetColor.r) + Math.abs(g - targetColor.g) + Math.abs(b - targetColor.b);
        if (colorDiff < tolerance) data[i + 3] = 0;
      }
      tempCtx.putImageData(imageData, 0, 0);
    }
    if (cfg.w && cfg.h) {
      ctx.drawImage(tempCanvas, cfg.x || 0, cfg.y || 0, cfg.w, cfg.h);
    } else {
      ctx.drawImage(tempCanvas, cfg.x || 0, cfg.y || 0);
    }
  } catch (e) {
    console.warn("⚠️ Không load logo:", logoPath, e.message);
  }
}

async function drawTop1Logo(ctx, layoutConf, logoPath) {
  if (!logoPath || !layoutConf.logoTop1) return;
  const logoCfg = layoutConf.logoTop1;
  if (logoCfg && (logoCfg.x !== undefined || logoCfg.y !== undefined)) {
    await drawLogo(ctx, logoCfg, logoPath);
    console.log("✅ Đã vẽ thêm logo Top 1 riêng");
  }
}

/**
 * ✅ Vẽ ảnh khung giờ (slot) lên canvas, hỗ trợ vẽ lặp lại nhiều lần
 * với độ lệch tọa độ x (step), dùng để tạo hiệu ứng đổ bóng/viền/lệch nhẹ.
 */
async function drawSlotImage(ctx, slotImgCfg) {
  if (!slotImgCfg || !slotImgCfg.file) return;
  const imgPath = path.join(__dirname, "data", "anh", slotImgCfg.file);
  if (!fs.existsSync(imgPath)) {
    console.warn("⚠️ Không tìm thấy ảnh slot:", imgPath);
    return;
  }
  try {
    const img = await loadImage(imgPath);
    let x = slotImgCfg.x || 0;
    let y = slotImgCfg.y || 0;
    const w = typeof slotImgCfg.w === "number" ? slotImgCfg.w : img.width;
    const h = typeof slotImgCfg.h === "number" ? slotImgCfg.h : img.height;
    const step = typeof slotImgCfg.step === "number" ? slotImgCfg.step : 2;
    const repeat = typeof slotImgCfg.repeat === "number" ? slotImgCfg.repeat : 5;
    for (let i = 0; i < repeat; i++) {
      ctx.drawImage(img, x, y, w, h);
      x += step;
    }
  } catch (err) {
    console.log("❌ Lỗi tải ảnh slot:", err.message);
  }
}

function aggregateTeams(matchDetails, mode = "normal", cprThreshold = 41) {
  const teamStats = new Map();
  let champion = null;
  let finalMatchCount = matchDetails.length;

  for (let i = 0; i < matchDetails.length; i++) {
    const match = matchDetails[i];
    const matchNumber = i + 1;
    const matchKeys = new Map();

    for (const t of match.ranks) {
      let key = null;
      for (const [k, stats] of teamStats.entries()) {
        const overlap = (t.playerAccountIds || []).filter((id) => stats.playerIds.has(id)).length;
        if (overlap >= 2) { key = k; break; }
      }
      if (!key) {
        key = (t.playerAccountIds || []).sort().join(",") || `team_${Date.now()}_${Math.random()}`;
      }
      if (!teamStats.has(key)) {
        teamStats.set(key, {
          playerIds: new Set(),
          totalScore: 0, totalKills: 0, totalBooyahs: 0,
          BooyahsGame: [], isEligible: false,
          accountNames: Array.isArray(t.accountNames) ? t.accountNames.slice() : [],
          teamName: t.teamName,
        });
      } else {
        const existing = teamStats.get(key);
        if ((!existing.accountNames || existing.accountNames.length === 0) &&
            Array.isArray(t.accountNames) && t.accountNames.length) {
          existing.accountNames = t.accountNames.slice();
        }
      }
      matchKeys.set(t, key);
      (t.playerAccountIds || []).forEach((id) => teamStats.get(key).playerIds.add(id));
    }

    if (mode === "cpr") {
      const booyahTeam = match.ranks.find((r) => r.booyah > 0);
      if (booyahTeam) {
        const booyahKey = matchKeys.get(booyahTeam);
        const booyahStats = teamStats.get(booyahKey);
        if (booyahStats && booyahStats.isEligible) {
          champion = { teamKey: booyahKey, matchWon: matchNumber };
          finalMatchCount = matchNumber;
        }
      }
    }

    match.ranks.forEach((t) => {
      const key = matchKeys.get(t);
      const stats = teamStats.get(key);
      if (stats) {
        stats.totalScore += Number(t.score) || 0;
        stats.totalKills += Number(t.kill) || 0;
        stats.totalBooyahs += Number(t.booyah) || 0;
        if (Number(t.booyah) > 0) stats.BooyahsGame.push(matchNumber);
        if (mode === "cpr" && !stats.isEligible && stats.totalScore >= cprThreshold) {
          stats.isEligible = true;
        }
      }
    });
    if (champion) break;
  }

  let finalTeams = Array.from(teamStats.entries()).map(([key, stats]) => {
    let displayName;
    if (stats.teamName !== "") {
      displayName = stats.teamName;
    } else if (Array.isArray(stats.accountNames) && stats.accountNames.length && String(stats.accountNames[0]).trim()) {
      displayName = String(stats.accountNames[0]).trim();
    } else {
      displayName = "Không tên";
    }
    return { teamKey: key, displayName, ...stats, playerIds: Array.from(stats.playerIds) };
  });

  finalTeams.sort((a, b) => {
    if (mode === "cpr" && champion) {
      if (a.teamKey === champion.teamKey) return -1;
      if (b.teamKey === champion.teamKey) return 1;
    }
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.totalBooyahs !== a.totalBooyahs) return b.totalBooyahs - a.totalBooyahs;
    return b.totalKills - a.totalKills;
  });

  finalTeams.forEach((t, i) => { t.Top = i + 1; });
  return { teams: finalTeams, champion, finalMatchCount };
}

// ============================================================
// 🎟 HỆ THỐNG LƯỢT (turns) + VÔ HẠN (vohan cá nhân / vohan box)
// ============================================================

function safeReadJson(fp) {
  try {
    return fs.readJsonSync(fp, { throws: false }) || {};
  } catch {
    return {};
  }
}

function safeWriteJson(fp, obj) {
  try {
    fs.writeJsonSync(fp, obj, { spaces: 2 });
  } catch (e) {
    console.error("❌ Lỗi ghi file:", fp, e.message);
  }
}

function getUserTurns(userId) {
  const turnsData = safeReadJson(turnsFilePath);
  return Number(turnsData[userId] || 0);
}

/**
 * Trừ 1 lượt của user, trả về số lượt còn lại sau khi trừ.
 */
function deductUserTurn(userId) {
  const turnsData = safeReadJson(turnsFilePath);
  const current = Number(turnsData[userId] || 0);
  const next = Math.max(0, current - 1);
  turnsData[userId] = next;
  safeWriteJson(turnsFilePath, turnsData);
  return next;
}

/**
 * Kiểm tra vohan cá nhân (miễn phí không giới hạn cho 1 user tới 1 thời điểm hết hạn).
 * Trả về true nếu còn hiệu lực.
 */
function checkPersonalVohan(userId) {
  const vohanData = safeReadJson(vohanFilePath);
  const expiry = vohanData[userId];
  if (expiry && moment().isBefore(moment(expiry))) {
    return true;
  }
  if (expiry) {
    delete vohanData[userId];
    safeWriteJson(vohanFilePath, vohanData);
  }
  return false;
}

/**
 * Kiểm tra vohan box (miễn phí cho cả nhóm hoặc chỉ admin trong nhóm) theo threadId.
 * Trả về { free: boolean, scope: "all"|"admin"|null }
 */
async function checkBoxVohan(threadId, senderId, api) {
  const boxData = safeReadJson(vohanBoxFilePath);
  const boxStatus = boxData[threadId];
  if (!boxStatus || !boxStatus.expiry) return { free: false, scope: null };

  if (moment().isBefore(moment(boxStatus.expiry))) {
    if (boxStatus.scope === "all") return { free: true, scope: "all" };
    if (boxStatus.scope === "admin") {
      try {
        // Zalo: lấy thông tin nhóm để kiểm tra admin (tuỳ thư viện zca-js cung cấp API nào)
        const groupInfo = await api.getGroupInfo(threadId);
        const admins =
          groupInfo?.adminIds ||
          groupInfo?.gInfo?.adminIds ||
          groupInfo?.adminIDs ||
          [];
        if (admins.map(String).includes(String(senderId))) {
          return { free: true, scope: "admin" };
        }
      } catch (e) {
        console.error("[td] Lỗi kiểm tra admin nhóm (vohan box):", e.message);
      }
    }
    return { free: false, scope: boxStatus.scope };
  } else {
    delete boxData[threadId];
    safeWriteJson(vohanBoxFilePath, boxData);
    return { free: false, scope: null };
  }
}

/**
 * Xác định trạng thái miễn phí tổng hợp của user trong 1 lần chạy lệnh.
 * Trả về { isFree: boolean, reason: "box" | "personal" | null }
 */
async function resolveFreeStatus(threadId, senderId, api) {
  const box = await checkBoxVohan(threadId, senderId, api);
  if (box.free) return { isFree: true, reason: "box" };
  if (checkPersonalVohan(senderId)) return { isFree: true, reason: "personal" };
  return { isFree: false, reason: null };
}

// ============================================================
// 📌 CONFIG LỆNH
// ============================================================



// ============================================================
// 🆕 HỎI CHỌN KHUNG GIỜ (Zalo reply)
// ============================================================

async function askChooseSlotViaReply({ api, event, accountId, senderID, key, xoaN, mode, cprThreshold }) {
  const { threadId, type, data } = event;

  const text =
`⏳ Vui lòng chọn khung giờ tính điểm:

1. 13:00 ➟ 15:00
2. 15:00 ➟ 17:00
3. 18:00 ➟ 20:00
4. 20:00 ➟ 21:50
5. 21:40 ➟ 23:30
6. 23:00 ➟ 01:00
7. 01:00 ➟ 03:00
8. 10:00 ➟ 12:00

📌 Trả lời (reply/quote) tin nhắn này bằng số tương ứng để chọn.
(Có thể chọn nhiều khung giờ, cách nhau bằng dấu phẩy, vd: 3,4)
Yêu cầu bởi: ${data?.dName || "Người dùng"}`;

  const info = await api.sendMessage({ msg: text }, threadId, type);

  const replyPayload = {
    name: __legacyConfig.name,
    author: senderID,
    accountId,
    key,
    xoaN,
    mode,
    cprThreshold,
    // 🆕 lưu lại thông tin tin nhắn hỏi khung giờ để có thể xoá (thu hồi) sau khi user reply xong
    promptMsg: {
      msgId: info?.message?.msgId || info?.msgId,
      cliMsgId: info?.message?.cliMsgId || info?.cliMsgId,
      uidFrom: info?.message?.uidFrom || info?.uidFrom || "0"
    }
  };

  // zca-js: tin nhắn gửi đi thường trả về message.msgId (đôi khi cliMsgId)
  const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId);
  global.client.handleReply.set(replyMsgId, replyPayload);

  // dọn state sau 10 phút để tránh rác bộ nhớ nếu user không bao giờ reply
  setTimeout(() => {
    global.client.handleReply.delete(replyMsgId);
  }, 10 * 60 * 1000);
}

// ============================================================
// 🚀 RUN
// ============================================================



// ============================================================
// 🆕 XỬ LÝ REPLY / QUOTE TRÊN ZALO
// ============================================================

/**
 * Lấy nội dung reply thô từ payload sự kiện Zalo (zca-js), thử nhiều
 * vị trí khác nhau tùy phiên bản thư viện.
 */
function extractRawReplyContent(params) {
  const event = params?.event || {};
  const candidates = [
    params?.content,
    params?.cleanContent,
    params?.text,
    event?.data?.content,
    event?.content,
    event?.data?.data?.content,
    event?.msg,
    event?.data?.msg,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
    if (c && typeof c === "object" && typeof c.text === "string") return c.text;
  }
  return "";
}

function stripMentionsFromContent(params) {
  const event = params?.event || {};
  let content = String(extractRawReplyContent(params) || "").trim();

  const mentions = event?.data?.mentions || event?.data?.mention || event?.mentions || null;
  if (Array.isArray(mentions)) {
    for (const m of mentions) {
      const mentionText = m?.text || m?.name || m?.data || null;
      if (mentionText && typeof mentionText === "string") {
        content = content.split(mentionText).join(" ");
      }
    }
  } else if (mentions && typeof mentions === "object") {
    for (const key of Object.keys(mentions)) {
      const m = mentions[key];
      const mentionText = (m && (m.text || m.name || m.data)) || null;
      if (mentionText && typeof mentionText === "string") {
        content = content.split(mentionText).join(" ");
      }
    }
  }

  content = content.replace(/^@\S+(\s+\S+)*?(?=\s+\d)/, "").trim();
  content = content.replace(/^@\S+/, "").trim();

  return content.replace(/\s+/g, " ").trim();
}

/**
 * Parse nội dung reply -> danh sách slot + tail params.
 * Hỗ trợ chọn nhiều khung giờ: "3,4" hoặc "3, 4 cpr41"
 */
function parseReplySlotsAndTail(rawContent) {
  const cleaned = String(rawContent || "").trim();
  if (!cleaned) return { error: "❌ Vui lòng reply số từ 1 đến 8 (có thể nhiều số, cách nhau dấu phẩy)." };

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0] || "";
  const slotCandidates = firstToken.split(",").map((s) => s.trim()).filter(Boolean);
  const slots = slotCandidates
    .map((n) => parseInt(n, 10))
    .filter((n) => TIME_SLOTS[n]);

  if (!slots.length) {
    return { error: "❌ Vui lòng reply số từ 1 đến 8 (có thể nhiều số, cách nhau dấu phẩy)." };
  }

  const tail = tokens.slice(1);
  const xoaN = parseXoaToken(tail);
  const key = parseKeyToken(tail) || null; // null => giữ nguyên key gốc từ lúc gọi lệnh
  const cpr = parseCprToken(tail);
  const mode = cpr ? "cpr" : null;

  return { slots, xoaN, key, mode, cprThreshold: cpr };
}

/**
 * 🆕 module.exports.onReply
 * Framework Zalo (zca-js) cần tự gọi hàm này khi phát hiện một tin nhắn
 * là "quote/reply" tới tin nhắn hỏi chọn khung giờ của lệnh td.
 * Cách xác định: lấy quoteMsgId từ event (globalMsgId/cliMsgId của tin
 * nhắn bị quote) rồi kiểm tra global.client.handleReply.has(quoteMsgId).
 *
 * params: { api, event, quoteMsgId }
 */


// ============================================================
// 🔁 FLOW THỰC THI (fallback qua hôm qua nếu hôm nay không có trận)
// ============================================================

async function executeFlowWithFallback({
  api, event, accountId, slotId,
  start: customStart, end: customEnd,
  key, xoaN, mode, cprThreshold, useCustomRange = false,
}) {
  const { threadId, type } = event;
  let baseStart, baseEnd;

  if (useCustomRange && customStart && customEnd) {
    baseStart = customStart;
    baseEnd = customEnd;
  } else {
    const baseRange = computeStartEndFromToday(slotId);
    if (!baseRange) return;
    baseStart = baseRange.start;
    baseEnd = baseRange.end;
  }

  let success = await tryExecute({ api, event, accountId, start: baseStart, end: baseEnd, key, xoaN, mode, cprThreshold });
  if (success) return;

  const yesterdayStart = moment(baseStart).subtract(1, "day");
  const yesterdayEnd = moment(baseEnd).subtract(1, "day");
  success = await tryExecute({ api, event, accountId, start: yesterdayStart, end: yesterdayEnd, key, xoaN, mode, cprThreshold });

  if (!success) {
    return api.sendMessage(
      { msg: `❌ Không tìm thấy trận đấu nào của ID trong khung giờ đã chọn!\n(Đã kiểm tra cả hôm nay và hôm qua)` },
      threadId,
      type
    );
  }
}

async function tryExecute(params) {
  try {
    const matchIds = await garenaApi.findMatches(params.accountId, params.start, params.end);
    if (!matchIds || !matchIds.length) return false;
    const result = await executeFlow(params);
    // executeFlow trả về false rõ ràng nếu bị từ chối do hết lượt (không tính là "không tìm thấy trận")
    if (result === "REJECTED") return true; // đã xử lý xong (từ chối), không cần fallback thêm
    return true;
  } catch (e) {
    console.error("[td] Lỗi:", e);
    return false;
  }
}

// ============================================================
// 🎨 FLOW CHÍNH: tìm trận, tính điểm, vẽ canvas, gửi ảnh, trừ lượt
// ============================================================

async function executeFlow({
  api, event, accountId, start, end,
  key = "NKNP", xoaN = null, mode = "normal", cprThreshold = null,
  useCustomRange = false,
}) {
  const { threadId, type, data } = event;
  const senderID = data?.uidFrom;

  // ---------- 1) Kiểm tra quyền dùng key ----------
  let keysConf = {};
  try {
    keysConf = ensureKeysConfig();
  } catch (e) {
    api.sendMessage({ msg: "❌ " + e.message }, threadId, type);
    return "REJECTED";
  }
  const keyConf = keysConf[key] || keysConf["NKNP"];
  if (!keyConf) {
    api.sendMessage({ msg: "❌ Không tìm thấy key và key mặc định." }, threadId, type);
    return "REJECTED";
  }
  const allowAdmins = Array.isArray(keyConf.admins) ? keyConf.admins : [];
  const allowCtvs = Array.isArray(keyConf.ctvs) ? keyConf.ctvs : [];
  if (
    (allowAdmins.length || allowCtvs.length) &&
    !(allowAdmins.includes(String(senderID)) || allowCtvs.includes(String(senderID)))
  ) {
    api.sendMessage({ msg: `❌ Bạn không có quyền dùng key "${key}".` }, threadId, type);
    return "REJECTED";
  }

  // ---------- 2) Kiểm tra trạng thái miễn phí (vohan box / vohan cá nhân) ----------
  const freeStatus = await resolveFreeStatus(threadId, senderID, api);
  let remainingTurnsAfter = null;

  if (!freeStatus.isFree) {
    const currentTurns = getUserTurns(senderID);
    if (currentTurns <= 0) {
      api.sendMessage(
        { msg: `🚫 Bạn đã hết lượt sử dụng lệnh này.\nVui lòng nạp thêm lượt để tiếp tục!` },
        threadId,
        type
      );
      return "REJECTED";
    }
  }

  // ---------- 3) Tìm trận đấu ----------
  let matchIds = [];
  try {
    matchIds = await garenaApi.findMatches(accountId, start, end);
  } catch (e) {
    console.error("Lỗi tìm kiếm trận:", e.message);
    api.sendMessage(
      { msg: "❌ ID đã hết lượt tính hoặc trang web Garena đang lỗi, vui lòng thử lại sau." },
      threadId,
      type
    );
    return "REJECTED";
  }

  if (!matchIds || !matchIds.length) return false;

  let matchDetails = [];
  try {
    matchDetails = await garenaApi.getMatchDetails(matchIds);
  } catch (e) {
    console.error("Lỗi lấy chi tiết trận:", e.message);
    api.sendMessage(
      { msg: "❌ ID đã hết lượt tính hoặc trang web Garena đang lỗi, vui lòng thử lại sau." },
      threadId,
      type
    );
    return "REJECTED";
  }

  if (Array.isArray(xoaN) && xoaN.length > 0) {
    const sorted = [...xoaN].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (Number.isInteger(idx) && idx >= 1 && idx <= matchDetails.length) {
        matchDetails.splice(idx - 1, 1);
      }
    }
  }

  const { teams, champion, finalMatchCount } = aggregateTeams(matchDetails, mode, cprThreshold);
  if (!teams.length) {
    api.sendMessage({ msg: "❌ Không có dữ liệu đội nào!" }, threadId, type);
    return "REJECTED";
  }

  // ---------- 4) Vẽ canvas bảng xếp hạng ----------
  const layoutId = keyConf.idbang || "lg1";
  let layoutPack;
  try {
    layoutPack = await loadLayoutById(layoutId);
  } catch (e) {
    console.error("Lỗi load layout:", e.message);
    api.sendMessage({ msg: "❌ " + e.message }, threadId, type);
    return "REJECTED";
  }

  try {
    const { layoutConf, bgImg } = layoutPack;
    const canvas = createCanvas(bgImg.width, bgImg.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bgImg, 0, 0);

    // Draw slot image (nếu có)
    if (layoutConf.slotImages) {
      const startHHmm = start.format("HH:mm");
      let matchedSlotId = null;
      for (const [sid, times] of Object.entries(TIME_SLOTS)) {
        if (times[0] === startHHmm) {
          matchedSlotId = sid;
          break;
        }
      }
      if (matchedSlotId && layoutConf.slotImages[matchedSlotId]) {
        await drawSlotImage(ctx, layoutConf.slotImages[matchedSlotId]);
        console.log("✅ Vẽ ảnh slot:", matchedSlotId);
      }
    }

    const customName = keyConf.ct || key;
    const customName2 = keyConf.ct2 || key;
    const displayStart = moment(start).subtract(10, "minutes");

    const customTime = formatCustomTime(displayStart);
    const customTime1 = formatCustomTime1(displayStart);
    const customTime2 = formatCustomTime2(displayStart);
    const customTime3 = formatCustomTime3(displayStart);

    if (layoutConf.header) {
      if (layoutConf.header.customName) applyText(ctx, layoutConf.header.customName, customName);
      if (layoutConf.header.customName2) applyText(ctx, layoutConf.header.customName2, customName2);
      if (layoutConf.header.customTime) applyText(ctx, layoutConf.header.customTime, customTime);
      if (layoutConf.header.customTime1) applyText(ctx, layoutConf.header.customTime1, customTime1);
      if (layoutConf.header.customTime2) applyText(ctx, layoutConf.header.customTime2, customTime2);
      if (layoutConf.header.customTime3) applyText(ctx, layoutConf.header.customTime3, customTime3);

      const logoFromKey = keyConf.logo && String(keyConf.logo).trim() ? keyConf.logo : null;
      if (layoutConf.header.logos && Array.isArray(layoutConf.header.logos)) {
        for (let i = 0; i < teams.length; i++) {
          const logoCfg = layoutConf.header.logos[i];
          if (!logoCfg) continue;
          if (teams[i]) await drawLogo(ctx, logoCfg, logoFromKey);
        }
      }
    }

    const logoFromKey = keyConf.logo && String(keyConf.logo).trim() ? keyConf.logo : null;
    if (logoFromKey) await drawTop1Logo(ctx, layoutConf, logoFromKey);

    const maxRow = layoutConf.limit || 10;
    const rows = Math.min(maxRow, teams.length);

    // Draw fristRanks (nếu có)
    for (let i = 0; i < rows; i++) {
      const team = teams[i];
      const fristRankLayout = layoutConf.fristRanks;
      if (fristRankLayout && Array.isArray(fristRankLayout)) {
        const fristRankConfig = fristRankLayout[i];
        if (fristRankConfig !== undefined) {
          if (fristRankConfig.Name) applyText(ctx, fristRankConfig.Name, team.displayName);
          if (fristRankConfig.Kill) applyText(ctx, fristRankConfig.Kill, pad2(team.totalKills));
          if (fristRankConfig.Booyah) applyText(ctx, fristRankConfig.Booyah, pad2(team.totalBooyahs));
          if (fristRankConfig.Score) applyText(ctx, fristRankConfig.Score, pad2(team.totalScore));
        }
      }
    }

    // Draw normal Top1-Top10
    for (let i = 0; i < rows; i++) {
      const team = teams[i];
      const slotKey = `Top${i + 1}`;
      const slotCfg = layoutConf[slotKey];
      if (!slotCfg) continue;

      if (slotCfg.Top) applyText(ctx, slotCfg.Top, String(team.Top || i + 1));
      if (slotCfg.Name) applyText(ctx, slotCfg.Name, team.displayName);
      if (slotCfg.Kill) applyText(ctx, slotCfg.Kill, pad2(team.totalKills));
      if (slotCfg.Booyah) applyText(ctx, slotCfg.Booyah, pad2(team.totalBooyahs));
      if (slotCfg.Score) applyText(ctx, slotCfg.Score, pad2(team.totalScore));
    }

    // Draw Top1_extra (nếu có)
    const top1Team = teams[0];
    const top1ExtraCfg = layoutConf["Top1_extra"];
    if (top1Team && top1ExtraCfg) {
      if (top1ExtraCfg.Top) applyText(ctx, top1ExtraCfg.Top, String(top1Team.Top || 1));
      if (top1ExtraCfg.Name) applyText(ctx, top1ExtraCfg.Name, top1Team.displayName || "Không tên");
      if (top1ExtraCfg.Kill) applyText(ctx, top1ExtraCfg.Kill, pad2(top1Team.totalKills));
      if (top1ExtraCfg.Booyah) applyText(ctx, top1ExtraCfg.Booyah, pad2(top1Team.totalBooyahs));
      if (top1ExtraCfg.Score) applyText(ctx, top1ExtraCfg.Score, pad2(top1Team.totalScore));
    }

    // Draw BooyahGames (nếu có)
    if (layoutConf.BooyahGames) {
      for (const team of teams) {
        if (!team.BooyahsGame || team.BooyahsGame.length === 0) continue;
        for (const g of team.BooyahsGame) {
          const slotCfg = layoutConf.BooyahGames[`Game${g}`];
          if (slotCfg) applyText(ctx, slotCfg, team.displayName);
          if (Array.isArray(layoutConf.BooyahGames.LogosBooyah)) {
            const logoCfg = layoutConf.BooyahGames.LogosBooyah.find((l) => l.game === g);
            if (logoCfg && logoFromKey) await drawLogo(ctx, logoCfg, logoFromKey);
          }
        }
      }
    }

    const outPath = path.join(bxhRoot, `bxh-${layoutId}-${key}-${Date.now()}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer());

    // ---------- 5) Trừ lượt (nếu không miễn phí) + xây message ----------
    if (!freeStatus.isFree) {
      remainingTurnsAfter = deductUserTurn(senderID);
    }

    let msg = `🤖 NKNP BOT\n📊 ID: ${accountId}\n🎯 Số trận: ${finalMatchCount}\n⏳ Khung giờ: ${start.format("HH:mm")} → ${end.format("HH:mm DD/MM")}`;
    msg += `\n🔑 Key: ${key}`;

    if (xoaN) msg += `\n🗑️ Đã xóa: ${xoaN.join(", ")}`;

    if (mode === "cpr" && champion) {
      const champ = teams.find((t) => t.teamKey === champion.teamKey);
      if (champ) msg += `\n🏆 Vô địch CPR: ${champ.displayName} (trận ${champion.matchWon})`;
    }

    // 🎟 Báo lượt / vô hạn
    if (freeStatus.isFree) {
      if (freeStatus.reason === "personal") {
        msg += `\n🎟 Bạn đang dùng lượt vô hạn (cá nhân) ♾️`;
      } else if (freeStatus.reason === "box") {
        msg += `\n🎟 Nhóm/tài khoản này đang được miễn phí lượt (vô hạn) ♾️`;
      }
    } else {
      msg += `\n🎟 Bạn còn lại: ${remainingTurnsAfter} lượt sử dụng`;
    }

    // ---------- 6) Gửi ảnh ----------
    await api.sendMessage({ msg, attachments: [outPath], ttl: 300000 }, threadId, type);
    setTimeout(() => {
      try { fs.unlinkSync(outPath); } catch {}
    }, 310000);

    return true;
  } catch (e) {
    console.error("Lỗi tạo ảnh:", e);
    api.sendMessage({ msg: "❌ Lỗi tạo ảnh: " + e.message }, threadId, type);
    return "REJECTED";
  }
}

const __legacyConfig = {
  name: "td",
  version: "5.1.0-zalo",
  role: 0,
  author: "NKNP (Zalo port)",
  description: "Tính điểm Free Fire trên Zalo - reply chọn khung giờ, hỗ trợ custom time, CPR, xóa trận, hệ thống lượt/vô hạn + Auto xoá tin nhắn hỏi khung giờ sau khi reply",
  category: "game",
  usage: "td [idgame]  ➟ Bot sẽ hỏi và bắt buộc Reply số 1-8 để chọn khung giờ\ntd [idgame] HH:mm HH:mm [key] [xoaN] [cprN]\ntd [idgame] DD/MM/YYYY HH:mm DD/MM/YYYY HH:mm [key] [xoaN] [cprN]",
  cooldowns: 5,
};
const __legacyRun = async ({ args, event, api }) => {
  const { threadId, type, data } = event;
  const senderID = data?.uidFrom;

  try {
    const limitData = safeReadJson(limitPath);
    const threadLimit = limitData[threadId];
    if (threadLimit && threadLimit.game === false) {
      return api.sendMessage(
        { msg: "❎ Nhóm của bạn không được phép dùng lệnh trong mục 'Game'" },
        threadId,
        type
      );
    }
  } catch (e) {
    console.log("Lỗi khi đọc file limit.json trong lệnh td:", e);
  }

  if (!args[0]) {
    return api.sendMessage(
      {
        msg:
`❌ Thiếu ID game hoặc cú pháp không đúng.

• Hướng dẫn sử dụng:
.td [id] [xoaN] [cprN]
.td [id] [key] [xoaN] [cprN]

• Chú thích:
  » xoaN: Xóa trận lỗi (N là STT trận, vd: xoa1,2,3)
  » cprN: Tính CPR (N là điểm CPR cần đạt, vd: cpr41)`,
      },
      threadId,
      type
    );
  }

  const accountId = args[0];
  const rest = args.slice(1);

  // Kiểm tra quyền dùng key trước khi tiến hành (áp dụng cho mọi nhánh)
  const checkKeyPermission = (key) => {
    let keysConf = {};
    try {
      keysConf = ensureKeysConfig();
    } catch (e) {
      return { ok: false, msg: "❌ " + e.message };
    }
    const keyConf = keysConf[key] || keysConf["NKNP"];
    if (!keyConf) return { ok: false, msg: `❌ Không tìm thấy key "${key}" và key mặc định.` };
    const allowAdmins = Array.isArray(keyConf.admins) ? keyConf.admins : [];
    const allowCtvs = Array.isArray(keyConf.ctvs) ? keyConf.ctvs : [];
    if (
      (allowAdmins.length || allowCtvs.length) &&
      !(allowAdmins.includes(String(senderID)) || allowCtvs.includes(String(senderID)))
    ) {
      return { ok: false, msg: `❌ Bạn không có quyền dùng key "${key}".` };
    }
    return { ok: true, keyConf };
  };

  // Try full time range (DD/MM/YYYY HH:mm DD/MM/YYYY HH:mm)
  if (args.length >= 5) {
    try {
      const flowArgs = parseFullTimeArgs(args);
      const perm = checkKeyPermission(flowArgs.key);
      if (!perm.ok) return api.sendMessage({ msg: perm.msg }, threadId, type);

      if (!flowArgs.start.isValid() || !flowArgs.end.isValid()) {
        return api.sendMessage({ msg: "❌ Lỗi parse ngày giờ, kiểm tra lại format." }, threadId, type);
      }
      if (flowArgs.start.isSameOrAfter(flowArgs.end)) {
        return api.sendMessage(
          {
            msg: `❌ Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.\nStart: ${flowArgs.start.format("DD/MM/YYYY HH:mm")}\nEnd: ${flowArgs.end.format("DD/MM/YYYY HH:mm")}`,
          },
          threadId,
          type
        );
      }
      return executeFlow({ ...flowArgs, api, event, useCustomRange: true });
    } catch (err) {
      return api.sendMessage({ msg: err.message }, threadId, type);
    }
  }

  // Try short time range (HH:mm HH:mm)
  const shortRange = parseShortTimeRange(accountId, rest);
  if (shortRange) {
    const { start, end } = shortRange;
    let extraTokens;
    if (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(rest[0].trim())) {
      extraTokens = rest.slice(1);
    } else {
      extraTokens = rest.slice(2);
    }
    const xoaN = parseXoaToken(extraTokens);
    const key = parseKeyToken(extraTokens) || "NKNP";
    const cpr = parseCprToken(extraTokens);
    const mode = cpr ? "cpr" : "normal";

    const perm = checkKeyPermission(key);
    if (!perm.ok) return api.sendMessage({ msg: perm.msg }, threadId, type);

    return executeFlowWithFallback({
      api, event, accountId, start, end, key, xoaN, mode, cprThreshold: cpr, useCustomRange: true,
    });
  }

  // Còn lại: bắt buộc chọn slot qua reply/quote
  const xoaN = parseXoaToken(rest);
  const key = parseKeyToken(rest) || "NKNP";
  const cpr = parseCprToken(rest);
  const mode = cpr ? "cpr" : "normal";

  const perm = checkKeyPermission(key);
  if (!perm.ok) return api.sendMessage({ msg: perm.msg }, threadId, type);

  return askChooseSlotViaReply({ api, event, accountId, senderID, key, xoaN, mode, cprThreshold: cpr });
};
const __legacyOnReply = async (params) => {
  const api = params?.api;
  const event = params?.event || {};
  const { threadId, type, data } = event;
  const quoteMsgId = String(
    params?.quoteMsgId ||
    event?.data?.quote?.globalMsgId ||
    event?.data?.quote?.cliMsgId ||
    ""
  );

  try {
    if (!api || typeof api.sendMessage !== "function") {
      console.error("❌ [td] onReply: thiếu 'api' hoặc api.sendMessage không tồn tại.");
      return;
    }

    if (!quoteMsgId || !global.client.handleReply.has(quoteMsgId)) {
      return; // Không phải reply cho lệnh td, bỏ qua
    }

    const handleReplyData = global.client.handleReply.get(quoteMsgId);

    // Chỉ cho phép đúng người tạo lệnh reply
    if (data?.uidFrom !== handleReplyData.author) {
      console.log("[td] onReply: người reply không phải người tạo lệnh, bỏ qua.");
      return;
    }

    const rawContent = stripMentionsFromContent(params);
    const parsed = parseReplySlotsAndTail(rawContent);
    if (parsed.error) {
      return api.sendMessage({ msg: parsed.error }, threadId, type);
    }

    const { slots, xoaN, key, mode, cprThreshold } = parsed;

    // Xóa state reply sau khi đã dùng (tránh reply lại nhiều lần gây nhầm)
    global.client.handleReply.delete(quoteMsgId);

    // ============================================================
    // 🆕 XOÁ (thu hồi) tin nhắn hỏi khung giờ của bot (chỉ tin nhắn của bot,
    // KHÔNG xoá tin nhắn reply của người dùng), ngay sau khi xác nhận
    // lựa chọn hợp lệ.
    // ============================================================
    const prompt = handleReplyData.promptMsg || {};
    await tryDeleteMessage(
      api,
      { cliMsgId: prompt.cliMsgId, msgId: prompt.msgId, uidFrom: prompt.uidFrom || "0" },
      threadId,
      type
    );

    for (const slot of slots) {
      const range = computeStartEndFromToday(slot);
      if (!range) continue;

      await executeFlowWithFallback({
        api,
        event,
        accountId: handleReplyData.accountId,
        slotId: slot,
        start: range.start,
        end: range.end,
        key: key || handleReplyData.key || "NKNP",
        xoaN: xoaN || handleReplyData.xoaN,
        mode: mode || handleReplyData.mode || "normal",
        cprThreshold: cprThreshold || handleReplyData.cprThreshold,
        useCustomRange: false,
      });
    }
  } catch (err) {
    console.error("❌ [td] onReply lỗi không mong muốn:", err);
    try {
      if (api && typeof api.sendMessage === "function") {
        await api.sendMessage({ msg: "❌ Lỗi xử lý reply: " + err.message }, threadId, type);
      }
    } catch (_) {}
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
