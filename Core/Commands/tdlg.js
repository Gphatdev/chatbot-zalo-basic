/**
 * [PORT TỪ NKNP] tdlg.js
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

const datateamRoot = path.join(__dirname, "datateam");

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
  .filter(f => f.endsWith(".ttf") || f.endsWith(".otf"))
  .forEach(f => {
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
  5: ["21:40", "23:40"],
  6: ["23:00", "01:00"],
  7: ["01:00", "03:00"],
  8: ["10:00", "12:00"]
};

const REPLY_NAME = "tdlg";

// ============================================================
// 🆕 FIX (Zalo): Zalo (zca-js) không có handleReply kiểu FCA
// (không có global.client.handleReply.push(...) + module.exports.handleReply
// nhận {handleReply} do core tự tra cứu theo messageID). Thay vào đó ta tự lưu
// state theo msgId của tin nhắn hỏi khung giờ vào 1 Map toàn cục, rồi đối chiếu
// khi phát hiện tin nhắn "quote/reply" tới đúng msgId đó (giống key.js/td.js).
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
    console.error("⚠️ [tdlg] Lỗi thu hồi tin nhắn:", e.message);
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
      return m[1].split(",").map(n => parseInt(n.trim(), 10)).filter(n => Number.isInteger(n) && n >= 1);
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

function ensureKeysConfig() {
  if (!fs.existsSync(keysPath)) {
    fs.writeFileSync(keysPath, JSON.stringify({
      NKNP: { ct: "SCO RING", ct2: "NKNP", idbang: "lg1", logo: "", admins: [], ctvs: [] }
    }, null, 2));
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
  const rawJson = fs.readFileSync(layoutJson, { encoding: "utf8", flag: "r" });
  const layoutConf = JSON.parse(rawJson);
  const bgImg = await loadImage(bgPath);
  return { layoutDir, layoutConf, bgImg };
}

// ─── LOGIC VẼ ẢNH: GIỮ NGUYÊN 100% so với bản gốc ────────
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
      const isTargetDark = targetColor.r < 50 && targetColor.g < 50 && targetColor.b < 50;
      if (!isTargetDark) {
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const diff = Math.abs(r - targetColor.r) + Math.abs(g - targetColor.g) + Math.abs(b - targetColor.b);
          if (diff < tolerance) data[i + 3] = 0;
        }
        tempCtx.putImageData(imageData, 0, 0);
      }
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

function computeStartEndFromToday(slotId) {
  const [s, e] = TIME_SLOTS[slotId];
  if (!s || !e) return null;
  const today = moment().tz(TIME_ZONE);
  const start = moment.tz(today.format("DD/MM/YYYY") + " " + s, "DD/MM/YYYY HH:mm", TIME_ZONE);
  let end = moment.tz(today.format("DD/MM/YYYY") + " " + e, "DD/MM/YYYY HH:mm", TIME_ZONE);
  if (end.isBefore(start)) end.add(1, "day");
  return { start, end };
}

function aggregateTeams(matchDetails, mode = "normal", cprThreshold = null) {
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
        const overlap = (t.playerAccountIds || []).filter(id => stats.playerIds.has(id)).length;
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
          teamName: t.teamName || ""
        });
      } else {
        const existing = teamStats.get(key);
        if ((!existing.accountNames || !existing.accountNames.length) &&
            Array.isArray(t.accountNames) && t.accountNames.length) {
          existing.accountNames = t.accountNames.slice();
        }
        if (!existing.teamName && t.teamName) existing.teamName = t.teamName;
      }
      matchKeys.set(t, key);
      (t.playerAccountIds || []).forEach(id => teamStats.get(key).playerIds.add(id));
    }

    if (mode === "cpr") {
      const booyahTeam = match.ranks.find(r => r.booyah > 0);
      if (booyahTeam) {
        const booyahKey = matchKeys.get(booyahTeam);
        const booyahStats = teamStats.get(booyahKey);
        if (booyahStats && booyahStats.isEligible) {
          champion = { teamKey: booyahKey, matchWon: matchNumber };
          finalMatchCount = matchNumber;
        }
      }
    }

    match.ranks.forEach(t => {
      const key = matchKeys.get(t);
      const stats = teamStats.get(key);
      if (stats) {
        stats.totalScore += Number(t.score) || 0;
        stats.totalKills += Number(t.kill) || 0;
        stats.totalBooyahs += Number(t.booyah) || 0;
        if (Number(t.booyah) > 0) stats.BooyahsGame.push(matchNumber);
        if (mode === "cpr" && !stats.isEligible && stats.totalScore >= (cprThreshold || 41)) {
          stats.isEligible = true;
        }
      }
    });

    if (champion) break;
  }

  let finalTeams = Array.from(teamStats.entries()).map(([key, stats]) => {
    let displayName;
    if (stats.teamName && stats.teamName.trim() !== "") {
      displayName = stats.teamName.trim();
    } else if (Array.isArray(stats.accountNames) && stats.accountNames.length && String(stats.accountNames[0]).trim()) {
      displayName = String(stats.accountNames[0]).trim();
    } else {
      displayName = "Không tên";
    }
    return { teamKey: key, displayName, teamName: stats.teamName || "", ...stats, playerIds: Array.from(stats.playerIds) };
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

  finalTeams.forEach((t, i) => t.Top = i + 1);
  return { teams: finalTeams, champion, finalMatchCount };
}
// ─── HẾT PHẦN VẼ ẢNH GIỮ NGUYÊN ───────────────────────────

function parseFullTimeArgs(args) {
  const accountId = args[0];
  const tail = args.slice(1);
  if (tail.length < 4) throw new Error("❌ Thiếu thông tin start/end thời gian.");

  const normalizeDateTime = (inputDate, inputTime) => {
    let [d, m, y] = inputDate.split("/").map(s => s.trim());
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
      [hh, min] = timeStr.split("h").map(n => parseInt(n, 10));
    } else if (/^\d{1,2}h$/.test(timeStr)) {
      hh = parseInt(timeStr.replace("h", ""), 10); min = 0;
    } else if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
      [hh, min] = timeStr.split(":").map(n => parseInt(n, 10));
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

// ============================================================
// 🔁 FIX (Zalo): threadId/type/uidFrom thay cho threadID/messageID/senderID
// ============================================================
async function executeFlowWithFallback({
  api, event, accountId,
  slotId,
  start: customStart, end: customEnd,
  key, xoaN, mode, cprThreshold,
  useCustomRange = false
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

  const yesterdayStart = moment(baseStart).subtract(1, 'day');
  const yesterdayEnd = moment(baseEnd).subtract(1, 'day');

  success = await tryExecute({ api, event, accountId, start: yesterdayStart, end: yesterdayEnd, key, xoaN, mode, cprThreshold });

  if (!success) {
    return api.sendMessage(
      { msg: `❌ Không tìm thấy trận đấu nào của ID trong khung giờ đã chọn!\n(Đã kiểm tra cả hôm nay và hôm qua)` },
      threadId, type
    );
  }
}

async function tryExecute(params) {
  try {
    const matchIds = await garenaApi.findMatches(params.accountId, params.start, params.end);
    if (!matchIds || !matchIds.length) return false;
    await executeFlow(params);
    return true;
  } catch (e) {
    console.error("[tdlg fallback] Lỗi:", e);
    return false;
  }
}

async function executeFlow({ api, event, accountId, start, end, key = "NKNP", xoaN = null, mode = "normal", cprThreshold = null }) {
  // 🔧 FIX (Zalo): threadId/type/uidFrom thay cho threadID/messageID/senderID
  const { threadId, type, data } = event;
  const senderID = data?.uidFrom;
  let isFreeForUser = false;

  // --- BƯỚC 1: VOHANBOX ---
  try {
    const vohanBoxData = fs.readJsonSync(vohanBoxFilePath, { throws: false }) || {};
    const boxStatus = vohanBoxData[threadId];
    if (boxStatus && boxStatus.expiry && moment().isBefore(moment(boxStatus.expiry))) {
      if (boxStatus.scope === 'all') {
        isFreeForUser = true;
      } else if (boxStatus.scope === 'admin') {
        // 🔧 FIX (Zalo): getGroupInfo thay cho getThreadInfo (Facebook), adminIds thay adminIDs
        try {
          const groupInfo = await api.getGroupInfo(threadId);
          const admins =
            groupInfo?.adminIds ||
            groupInfo?.gInfo?.adminIds ||
            groupInfo?.adminIDs ||
            [];
          if (admins.map(String).includes(String(senderID))) isFreeForUser = true;
        } catch (e) {
          console.error("[tdlg] Lỗi kiểm tra admin nhóm (vohan box):", e.message);
        }
      }
    } else if (boxStatus) {
      delete vohanBoxData[threadId];
      fs.writeJsonSync(vohanBoxFilePath, vohanBoxData, { spaces: 2 });
    }
  } catch (e) {
    console.error("[tdlg] Lỗi vohan_box:", e);
  }

  // --- BƯỚC 2: VOHAN CÁ NHÂN ---
  if (!isFreeForUser) {
    try {
      const vohanData = fs.readJsonSync(vohanFilePath, { throws: false }) || {};
      if (vohanData[senderID] && moment().isBefore(moment(vohanData[senderID]))) {
        isFreeForUser = true;
      } else if (vohanData[senderID]) {
        delete vohanData[senderID];
        fs.writeJsonSync(vohanFilePath, vohanData, { spaces: 2 });
      }
    } catch (e) {
      console.error("[tdlg] Lỗi vohan cá nhân:", e);
    }
  }

  // --- BƯỚC 3: KIỂM TRA LƯỢT ---
  if (!isFreeForUser) {
    try {
      const turnsData = fs.readJsonSync(turnsFilePath, { throws: false }) || {};
      const userTurns = turnsData[senderID] || 0;
      if (userTurns <= 0) {
        return api.sendMessage({ msg: `🚫 Bạn đã hết lượt sử dụng lệnh /tdlg.\nVui lòng nạp thêm lượt để tiếp tục!` }, threadId, type);
      }
    } catch (e) {
      console.error("[tdlg] Lỗi lượt:", e);
      return api.sendMessage({ msg: "❌ Đã có lỗi xảy ra với hệ thống lượt, vui lòng thử lại sau." }, threadId, type);
    }
  }

  let keysConf = {};
  try { keysConf = ensureKeysConfig(); } catch (e) {
    return api.sendMessage({ msg: "❌ " + e.message }, threadId, type);
  }

  const keyConf = keysConf[key] || keysConf["NKNP"];
  if (!keyConf) return api.sendMessage({ msg: "❌ Không tìm thấy key và key mặc định." }, threadId, type);

  const allowAdmins = Array.isArray(keyConf.admins) ? keyConf.admins : [];
  const allowCtvs = Array.isArray(keyConf.ctvs) ? keyConf.ctvs : [];
  if ((allowAdmins.length || allowCtvs.length) &&
      !(allowAdmins.includes(String(senderID)) || allowCtvs.includes(String(senderID)))) {
    return api.sendMessage({ msg: `❌ Bạn không có quyền dùng key "${key}".` }, threadId, type);
  }

  let matchIds = [];
  try {
    matchIds = await garenaApi.findMatches(accountId, start, end);
  } catch (e) {
    console.error(e);
    return api.sendMessage({ msg: "ID Đã Hết Lượt Tính Hoặc Lỗi Trang Tính Điểm Gà Rán" }, threadId, type);
  }
  if (!matchIds || !matchIds.length) return false;

  let matchDetails = [];
  try {
    matchDetails = await garenaApi.getMatchDetails(matchIds);
  } catch (e) {
    console.error(e);
    return api.sendMessage({ msg: "ID Đã Hết Lượt Tính Hoặc Lỗi Trang Tính Điểm Gà Rán" }, threadId, type);
  }

  if (Array.isArray(xoaN) && xoaN.length > 0) {
    const sorted = [...xoaN].sort((a, b) => b - a);
    for (const idx of sorted) {
      if (Number.isInteger(idx) && idx >= 1 && idx <= matchDetails.length) {
        matchDetails.splice(idx - 1, 1);
      }
    }
  }

  // ─── LOGIC VẼ ẢNH: GIỮ NGUYÊN 100% từ đây trở xuống (aggregateTeams, datateam, canvas...) ───
  const { teams, champion, finalMatchCount } = aggregateTeams(matchDetails, mode, cprThreshold);
  if (!teams.length) return api.sendMessage({ msg: "❌ Không có dữ liệu đội nào!" }, threadId, type);

  const logoFromKey = keyConf.logo && String(keyConf.logo).trim() ? keyConf.logo : null;

  // --- DATATEAM ---
  const idMap = new Map();
  const datateamFile = path.join(datateamRoot, String(senderID), "datateam.json");
  if (fs.existsSync(datateamFile)) {
    try {
      const data2 = JSON.parse(fs.readFileSync(datateamFile, "utf8"));
      for (const [teamName, arr] of Object.entries(data2)) {
        const teamData = arr[0];
        if (!teamData || !Array.isArray(teamData.accountID)) continue;
        teamData.accountID.forEach(maskedId => {
          const unmaskedId = maskedId.replace(/\*\*$/, "");
          if (!idMap.has(unmaskedId)) {
            idMap.set(unmaskedId, { teamName, logoPath: teamData.logo || null });
          }
        });
      }
    } catch (e) {
      console.error("[tdlg] Lỗi đọc datateam.json:", e.message);
    }
  }

  teams.forEach(team => {
    team.logoPath = null;
    for (const pid of team.playerIds) {
      const unmPid = String(pid).replace(/\*\*$/, "");
      if (idMap.has(unmPid)) {
        const info = idMap.get(unmPid);
        team.displayName = info.teamName;
        team.logoPath = info.logoPath || null;
        break;
      }
    }
    if (!team.logoPath) team.logoPath = logoFromKey;
  });

  // --- LƯU DATA ---
  try {
    const saveRoot = path.join(__dirname, "data", "FREEFIRE", "datatinhdiem");
    const dateStr = moment().tz(TIME_ZONE).format("YYYYMMDD");
    const saveDir = path.join(saveRoot, dateStr);
    fs.ensureDirSync(saveDir);
    const startStr = start.format("HHmm");
    const filename = `${senderID}-${startStr}-${accountId}.json`;
    const savePath = path.join(saveDir, filename);
    const saveData = {
      meta: {
        accountId, senderID, key, mode, cprThreshold,
        start: start.format("YYYY-MM-DD HH:mm"),
        end: end.format("YYYY-MM-DD HH:mm"),
        finalMatchCount, champion
      },
      teams
    };
    fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2), "utf8");
    console.log("✅ Đã lưu data:", savePath);
  } catch (err) {
    console.error("❌ Lỗi lưu data:", err.message);
  }

  const layoutId = keyConf.idbang || "lg1";
  let layoutPack;
  try {
    layoutPack = await loadLayoutById(layoutId);
  } catch (e) {
    console.error(e);
    return api.sendMessage({ msg: "❌ " + e.message }, threadId, type);
  }

  try {
    const { layoutConf, bgImg } = layoutPack;
    const canvas = createCanvas(bgImg.width, bgImg.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bgImg, 0, 0);

    const customName  = keyConf.ct  || key;
    const customName2 = keyConf.ct2 || key;

    // ✅ Trừ 10 phút để vẽ, không ảnh hưởng fetch data
    const displayStart = moment(start).subtract(10, "minutes");

    // Start time (trừ 10p)
    const customTime  = formatCustomTime(displayStart);
    const customTime1 = formatCustomTime1(displayStart);
    const customTime2 = formatCustomTime2(displayStart);
    const customTime3 = formatCustomTime3(displayStart);

    // ✅ End time = giờ đầu (displayStart), không dùng end
    const customTimeEnd  = formatCustomTime(displayStart);
    const customTimeEnd1 = formatCustomTime1(displayStart);
    const customTimeEnd2 = formatCustomTime2(displayStart);
    const customTimeEnd3 = formatCustomTime3(displayStart);

    if (layoutConf.header) {
      if (layoutConf.header.customName)  applyText(ctx, layoutConf.header.customName,  customName);
      if (layoutConf.header.customName2) applyText(ctx, layoutConf.header.customName2, customName2);

      // Start time
      if (layoutConf.header.customTime)  applyText(ctx, layoutConf.header.customTime,  customTime);
      if (layoutConf.header.customTime1) applyText(ctx, layoutConf.header.customTime1, customTime1);
      if (layoutConf.header.customTime2) applyText(ctx, layoutConf.header.customTime2, customTime2);
      if (layoutConf.header.customTime3) applyText(ctx, layoutConf.header.customTime3, customTime3);

      // ✅ End time (cùng giờ đầu - 10p)
      if (layoutConf.header.customTimeEnd)  applyText(ctx, layoutConf.header.customTimeEnd,  customTimeEnd);
      if (layoutConf.header.customTimeEnd1) applyText(ctx, layoutConf.header.customTimeEnd1, customTimeEnd1);
      if (layoutConf.header.customTimeEnd2) applyText(ctx, layoutConf.header.customTimeEnd2, customTimeEnd2);
      if (layoutConf.header.customTimeEnd3) applyText(ctx, layoutConf.header.customTimeEnd3, customTimeEnd3);

      if (Array.isArray(layoutConf.header.logos)) {
        for (let i = 0; i < teams.length; i++) {
          const logoCfg = layoutConf.header.logos[i];
          if (!logoCfg) continue;
          const logoToUse = teams[i]?.logoPath || logoFromKey;
          if (logoToUse) await drawLogo(ctx, logoCfg, logoToUse);
        }
        for (const customKey of ["custom1", "custom2", "custom3"]) {
          const customLogo = layoutConf.header.logos.find(l => String(l.top).toLowerCase() === customKey);
          if (customLogo && logoFromKey) await drawLogo(ctx, customLogo, logoFromKey);
        }
      }
    }

    const top1LogoToUse = teams[0]?.logoPath || logoFromKey;
    if (top1LogoToUse) await drawTop1Logo(ctx, layoutConf, top1LogoToUse);

    const maxRow = layoutConf.limit || 10;
    const rows = Math.min(maxRow, teams.length);

    for (let i = 0; i < rows; i++) {
      const team = teams[i];
      const fristRankLayout = layoutConf.fristRanks;
      if (fristRankLayout && Array.isArray(fristRankLayout)) {
        const fristRankConfig = fristRankLayout[i];
        if (fristRankConfig !== undefined) {
          if (fristRankConfig.Name)   applyText(ctx, fristRankConfig.Name,   team.displayName);
          if (fristRankConfig.Kill)   applyText(ctx, fristRankConfig.Kill,   pad2(team.totalKills));
          if (fristRankConfig.Booyah) applyText(ctx, fristRankConfig.Booyah, pad2(team.totalBooyahs));
          if (fristRankConfig.Score)  applyText(ctx, fristRankConfig.Score,  pad2(team.totalScore));
        }
      }

      const slotKey = `Top${i + 1}`;
      const slotCfg = layoutConf[slotKey];
      if (!slotCfg) continue;

      const teamName = team.displayName || "Không tên";
      if (slotCfg.Top)    applyText(ctx, slotCfg.Top,    String(team.Top || (i + 1)));
      if (slotCfg.Name)   applyText(ctx, slotCfg.Name,   teamName);
      if (slotCfg.Kill)   applyText(ctx, slotCfg.Kill,   pad2(team.totalKills));
      if (slotCfg.Booyah) applyText(ctx, slotCfg.Booyah, pad2(team.totalBooyahs));
      if (slotCfg.Score)  applyText(ctx, slotCfg.Score,  pad2(team.totalScore));

      const rowLogoToUse = team.logoPath || logoFromKey;
      if (rowLogoToUse && slotCfg.Logo) await drawLogo(ctx, slotCfg.Logo, rowLogoToUse);
    }

    const top1Team = teams[0];
    const top1ExtraCfg = layoutConf["Top1_extra"];
    if (top1Team && top1ExtraCfg) {
      if (top1ExtraCfg.Top)    applyText(ctx, top1ExtraCfg.Top,    String(top1Team.Top || 1));
      if (top1ExtraCfg.Name)   applyText(ctx, top1ExtraCfg.Name,   top1Team.displayName || "Không tên");
      if (top1ExtraCfg.Kill)   applyText(ctx, top1ExtraCfg.Kill,   pad2(top1Team.totalKills));
      if (top1ExtraCfg.Booyah) applyText(ctx, top1ExtraCfg.Booyah, pad2(top1Team.totalBooyahs));
      if (top1ExtraCfg.Score)  applyText(ctx, top1ExtraCfg.Score,  pad2(top1Team.totalScore));
    }

    if (layoutConf.BooyahGames) {
      for (const team of teams) {
        if (!team.BooyahsGame || !team.BooyahsGame.length) continue;
        for (const gameNo of team.BooyahsGame) {
          const cfg = layoutConf.BooyahGames["Game" + gameNo];
          if (cfg) applyText(ctx, cfg, team.displayName || "Không tên");
          if (Array.isArray(layoutConf.BooyahGames.LogosBooyah)) {
            const logoCfg = layoutConf.BooyahGames.LogosBooyah.find(l => l.game === gameNo);
            const booyahLogoToUse = team.logoPath || logoFromKey;
            if (logoCfg && booyahLogoToUse) await drawLogo(ctx, logoCfg, booyahLogoToUse);
          }
        }
      }
    }

    const outPath = path.join(bxhRoot, `bxh-${layoutId}-${key}-${Date.now()}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer());
    // ─── HẾT PHẦN VẼ ẢNH GIỮ NGUYÊN ───────────────────────

    let msgBody = "🤖 NKNP BOT 🤖\n\n";
    msgBody += `📊 ID: ${accountId}\n`;
    msgBody += `🎯 Số Trận: ${finalMatchCount}\n`;
    msgBody += `⌛ Khung Giờ: ${start.format("HH:mm")} | ${end.format("HH:mm DD/MM")}\n`;
    msgBody += `🔑 Key: ${key}\n\n`;
    if (xoaN && xoaN.length > 0) msgBody += `🗑 Xóa Trận: ${xoaN.join(", ")}\n`;
    if (mode === "cpr") {
      if (champion) {
        const champTeam = teams.find(t => t.teamKey === champion.teamKey);
        if (champTeam) msgBody += `🏆 Vô địch Cpr: ${champTeam.displayName || "Không tên"}  Booyah ở trận thứ ${champion.matchWon}\n`;
      } else {
        msgBody += `🏆 Vô địch Cpr: Chưa có\n`;
      }
    }
    if (mode === "cpr" && cprThreshold) msgBody += `🔹 CPR: ${cprThreshold} Điểm\n`;

    // ============================================================
    // 🔧 FIX (Zalo): GỬI ẢNH THEO LOGIC CỦA td.js
    // - api.sendMessage({ msg, attachments: [filePath] }, threadId, type)
    //   thay vì api.sendMessage({ body, attachment: fs.createReadStream(...) },
    //   threadID, callback, messageID) kiểu Facebook Messenger.
    // - Dùng await/try-catch thay vì callback (err, info) => {...}.
    // - Trừ lượt + đổi biệt danh xử lý ngay sau khi gửi thành công, không
    //   cần đợi callback riêng của Facebook API.
    // ============================================================
    try {
      await api.sendMessage({ msg: msgBody, attachments: [outPath] }, threadId, type);

      if (!isFreeForUser) {
        try {
          const currentTurnsData = fs.readJsonSync(turnsFilePath, { throws: false }) || {};
          const currentUserTurns = currentTurnsData[senderID] || 0;
          if (currentUserTurns > 0) {
            const newTurns = currentUserTurns - 1;
            currentTurnsData[senderID] = newTurns;
            fs.writeJsonSync(turnsFilePath, currentTurnsData, { spaces: 2 });

            const userInfo = await api.getUserInfo(senderID).catch(() => ({}));
            const userName = userInfo?.[senderID]?.name || "Người dùng";

            // 🔧 FIX (Zalo): api.changeNickname(name, threadId, userId) không có callback kiểu FCA
            try {
              await api.changeNickname(`${userName} | ${newTurns} lượt`, threadId, senderID);
            } catch (e) {
              console.log(`[tdlg] Không đổi được biệt danh:`, e.message);
            }
          }
        } catch (e) {
          console.error("[tdlg] Lỗi trừ lượt:", e);
        }
      }
    } catch (err) {
      console.error("[tdlg] Lỗi gửi tin:", err);
    } finally {
      try { fs.unlinkSync(outPath); } catch {}
    }
  } catch (e) {
    console.error(e);
    api.sendMessage({ msg: "❌ Lỗi dựng ảnh BXH: " + e.message }, threadId, type);
  }
}



// ============================================================
// 🔧 FIX (Zalo): event.threadId/type/data.uidFrom thay cho
// event.threadID/messageID/senderID (Facebook Messenger)
// ============================================================


// ============================================================
// 🔧 FIX (Zalo): module.exports.onReply thay cho module.exports.handleReply
// - Core Zalo (zca-js) tự gọi khi phát hiện 1 tin nhắn là quote/reply.
// - Đối chiếu quoteMsgId (event.data.quote.globalMsgId / cliMsgId) với
//   global.client.handleReply (Map) thay vì so khớp handleReply.messageID
//   do core FCA cung cấp sẵn.
// ============================================================

const __legacyConfig = {
  name: "tdlg",
  version: "6.1.0-zalo",
  role: 0,
  author: "Dev by NKNP-NGUYỄN THIẾT | Chuyển sang logic gửi ảnh Zalo (giữ nguyên logic vẽ ảnh) + Auto xoá tin nhắn hỏi khung giờ sau khi reply",
  description: "Tính Điểm Custom - Tự động lùi ngày + Logo datateam + Tên phòng giải + Khung giờ tùy chỉnh + Lưu data",
  category: "game",
  usage: "[id] [key] [xoaN] [cprN]",
  cooldowns: 5
};
const __legacyRun = async ({ args, api, event }) => {
  const { threadId, type, data } = event;
  const senderID = data?.uidFrom;

  try {
    const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
    const threadLimit = limitData[threadId];
    if (threadLimit && threadLimit.game === false) {
      return api.sendMessage({ msg: "❎ Thánh Địa Của Bạn Không Được Phép Dùng Thuật Chú Trong 'Game'" }, threadId, type);
    }
  } catch (e) {
    console.log("Lỗi khi đọc file limit.json trong lệnh tdlg:", e);
  }

  if (!args.length) {
    return api.sendMessage(
      {
        msg: "• Hướng dẫn sử dụng:\n.tdlg [id] [xoaN] [cprN]\n.tdlg [id] [key] [xoaN] [cprN]\n\n• Chú thích:\n  » xoaN: Xóa trận lỗi (N là STT trận, vd: xoa1,2,3)\n  » cprN: Tính CPR (N là điểm CPR cần đạt, vd: cpr41)"
      },
      threadId, type
    );
  }

  const accountId = args[0];
  const tail = args.slice(1);

  const shortRange = parseShortTimeRange(accountId, tail);
  if (shortRange) {
    const { start, end } = shortRange;
    let extraTokens;
    if (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(tail[0].trim())) {
      extraTokens = tail.slice(1);
    } else {
      extraTokens = tail.slice(2);
    }
    const xoaN = parseXoaToken(extraTokens);
    const key = parseKeyToken(extraTokens) || "NKNP";
    const cpr = parseCprToken(extraTokens);
    const mode = cpr ? "cpr" : "normal";
    let keysConf = {};
    try { keysConf = ensureKeysConfig(); } catch (e) {
      return api.sendMessage({ msg: "❌ " + e.message }, threadId, type);
    }
    const keyConf = keysConf[key] || keysConf["NKNP"];
    if (!keyConf) return api.sendMessage({ msg: `❌ Không tìm thấy key "${key}" và key mặc định.` }, threadId, type);
    const allowAdmins = Array.isArray(keyConf.admins) ? keyConf.admins : [];
    const allowCtvs = Array.isArray(keyConf.ctvs) ? keyConf.ctvs : [];
    if ((allowAdmins.length || allowCtvs.length) &&
        !(allowAdmins.includes(String(senderID)) || allowCtvs.includes(String(senderID)))) {
      return api.sendMessage({ msg: `❌ Bạn không có quyền dùng key "${key}".` }, threadId, type);
    }
    return executeFlowWithFallback({ api, event, accountId, start, end, key, xoaN, mode, cprThreshold: cpr, useCustomRange: true });
  }

  if (args.length >= 5) {
    try {
      const flowArgs = parseFullTimeArgs(args);
      if (!flowArgs.start.isValid() || !flowArgs.end.isValid()) {
        return api.sendMessage({ msg: "❌ Lỗi parse ngày giờ, kiểm tra lại format." }, threadId, type);
      }
      if (flowArgs.start.isSameOrAfter(flowArgs.end)) {
        return api.sendMessage(
          { msg: `❌ Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc.\nStart: ${flowArgs.start.format("DD/MM/YYYY HH:mm")}\nEnd: ${flowArgs.end.format("DD/MM/YYYY HH:mm")}` },
          threadId, type
        );
      }
      return executeFlow({ ...flowArgs, api, event });
    } catch (err) {
      return api.sendMessage({ msg: err.message }, threadId, type);
    }
  }

  const xoaN = parseXoaToken(tail);
  const key = parseKeyToken(tail) || "NKNP";
  const cpr = parseCprToken(tail);
  const mode = cpr ? "cpr" : "normal";

  let keysConf = {};
  try { keysConf = ensureKeysConfig(); } catch (e) {
    return api.sendMessage({ msg: "❌ " + e.message }, threadId, type);
  }
  const keyConf = keysConf[key] || keysConf["NKNP"];
  if (!keyConf) return api.sendMessage({ msg: `❌ Không tìm thấy key "${key}" và key mặc định.` }, threadId, type);
  const allowAdmins = Array.isArray(keyConf.admins) ? keyConf.admins : [];
  const allowCtvs = Array.isArray(keyConf.ctvs) ? keyConf.ctvs : [];
  if ((allowAdmins.length || allowCtvs.length) &&
      !(allowAdmins.includes(String(senderID)) || allowCtvs.includes(String(senderID)))) {
    return api.sendMessage({ msg: `❌ Bạn không có quyền dùng key "${key}".` }, threadId, type);
  }

  const uInfo = await api.getUserInfo(senderID).catch(() => ({}));
  const senderName = uInfo?.[senderID]?.name || "Người dùng";

  // ============================================================
  // 🔧 FIX (Zalo): hỏi chọn khung giờ bằng reply/quote giống td.js,
  // lưu state theo msgId vào global.client.handleReply (Map),
  // KHÔNG dùng global.client.handleReply.push(...) kiểu mảng (FCA).
  // ============================================================
  const info = await api.sendMessage(
    {
      msg:
        `⌛ Các Khung Giờ Tính Điểm ⌛\n\n1. 13:00-15:00\n2. 15:00-17:00\n3. 18:00-20:00\n4. 20:00-21:50\n5. 21:40-23:40\n6. 23:00-01:00\n7. 01:00-03:00\n8. 10:00-12:00\n\n📌 Trả lời (reply/quote) tin nhắn này bằng số để chọn khung giờ.\n(Có thể chọn nhiều khung giờ, cách nhau bằng dấu phẩy, vd: 3,4)\nYêu cầu bởi: ${senderName}`
    },
    threadId,
    type
  );

  const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId);
  global.client.handleReply.set(replyMsgId, {
    name: REPLY_NAME,
    author: senderID,
    accountId, key, xoaN, mode, cprThreshold: cpr,
    // 🆕 lưu lại thông tin tin nhắn hỏi khung giờ để có thể xoá (thu hồi) sau khi user reply xong
    promptMsg: {
      msgId: info?.message?.msgId || info?.msgId,
      cliMsgId: info?.message?.cliMsgId || info?.cliMsgId,
      uidFrom: info?.message?.uidFrom || info?.uidFrom || "0"
    }
  });

  // dọn state sau 10 phút nếu user không bao giờ reply, tránh rác bộ nhớ
  setTimeout(() => {
    global.client.handleReply.delete(replyMsgId);
  }, 10 * 60 * 1000);
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
      console.error("❌ [tdlg] onReply: thiếu 'api' hoặc api.sendMessage không tồn tại.");
      return;
    }

    if (!quoteMsgId || !global.client.handleReply.has(quoteMsgId)) return;

    const handleReplyData = global.client.handleReply.get(quoteMsgId);
    if (handleReplyData.name !== REPLY_NAME) return;

    const senderID = data?.uidFrom;
    if (senderID !== handleReplyData.author) {
      console.log("[tdlg] onReply: người reply không phải người tạo lệnh, bỏ qua.");
      return;
    }

    try {
      const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
      if (limitData[threadId]?.game === false) return;
    } catch (e) {}

    const rawContent = String(data?.content || "").trim();
    const selected = rawContent.split(",").map(s => s.trim()).filter(s => s !== "");
    const slotIds = selected.map(n => parseInt(n, 10)).filter(n => TIME_SLOTS[n]);

    if (!slotIds.length) {
      return api.sendMessage({ msg: "❌ Lựa chọn không hợp lệ. Hãy reply số 1-8." }, threadId, type);
    }

    // Xóa state reply sau khi đã dùng, tránh dùng lại nhầm
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

    for (const slotId of slotIds) {
      const { accountId, key, xoaN, mode, cprThreshold } = handleReplyData;
      await executeFlowWithFallback({ api, event, accountId, slotId, key, xoaN, mode, cprThreshold });
    }
  } catch (err) {
    console.error("❌ [tdlg] onReply lỗi không mong muốn:", err);
    try {
      if (api && typeof api.sendMessage === "function") {
        await api.sendMessage({ msg: "❌ Lỗi xử lý reply: " + err.message }, threadId, type);
      }
    } catch (_) {}
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
