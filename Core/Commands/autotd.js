/**
 * [PORT TỪ NKNP] autotd.js
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
const { ThreadType } = require("zca-js");

const FFRANK_PATH = path.join(__dirname, "ffrank");
const garenaApi = require(path.join(FFRANK_PATH, "api.js"));
const TIME_ZONE = "Asia/Ho_Chi_Minh";

const dataRoot = path.join(__dirname, "data");
const fontsPath = path.join(dataRoot, "fonts");
const bxhRoot = path.join(dataRoot, "FREEFIRE");
const layoutsRoot = path.join(bxhRoot, "layouts");
const keysPath = path.join(dataRoot, "keys.json");
// Đổi từ "../commands/cache/limit.json" (giả định cấu trúc thư mục kiểu GoatBot)
// sang tự chứa trong data/ của chính plugin này để không phụ thuộc thư mục ngoài.
const limitPath = path.join(dataRoot, "limit.json");

const turnsFilePath = path.join(__dirname, "data", "Luotdung", "bank_user_turns.json");
const vohanFilePath = path.join(__dirname, "data", "Luotdung", "tinhdiem_vohan.json");
const vohanBoxFilePath = path.join(__dirname, "data", "Luotdung", "vohan_box.json");
const enabledBoxesPath = path.join(__dirname, "data", "autotd_enabled_boxes.json");
const boxConfigPath = path.join(__dirname, "data", "autotd_box_config.json");

const datateamRoot = path.join(__dirname, "datateam");
const datateamffRoot = path.join(__dirname, "datateamff");

fs.ensureDirSync(dataRoot);
fs.ensureDirSync(fontsPath);
fs.ensureDirSync(bxhRoot);
fs.ensureDirSync(layoutsRoot);
fs.ensureFileSync(turnsFilePath);
fs.ensureFileSync(vohanFilePath);
fs.ensureFileSync(vohanBoxFilePath);
fs.ensureFileSync(enabledBoxesPath);
fs.ensureFileSync(boxConfigPath);
fs.ensureFileSync(limitPath);

if (fs.existsSync(fontsPath)) {
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
}

const TIME_SLOTS = {
    1: ["13:00", "15:00"],
    2: ["15:00", "17:00"],
    3: ["18:00", "20:00"],
    4: ["20:00", "21:50"],
    5: ["21:40", "23:40"],
    6: ["23:30", "02:00"],
    7: ["02:00", "05:00"],
    8: ["10:00", "12:00"],
};

// ============================================
// PAD 2 SỐ (đồng bộ td/tdlg)
// ============================================

function pad2(n) {
    return String(n || 0).padStart(2, "0");
}

// ============================================
// HELPER - ENABLED BOXES
// ============================================

function readEnabledBoxes() {
    if (!fs.existsSync(enabledBoxesPath)) {
        fs.writeJsonSync(enabledBoxesPath, {}, { spaces: 2 });
        return {};
    }
    try {
        return fs.readJsonSync(enabledBoxesPath);
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi đọc enabled_boxes:", e);
        return {};
    }
}

function writeEnabledBoxes(data) {
    try {
        fs.writeJsonSync(enabledBoxesPath, data, { spaces: 2 });
        return true;
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi ghi enabled_boxes:", e);
        return false;
    }
}

function isBoxEnabled(threadId) {
    const boxes = readEnabledBoxes();
    return boxes[threadId] === true;
}

function setBoxStatus(threadId, status) {
    const boxes = readEnabledBoxes();
    boxes[threadId] = status;
    return writeEnabledBoxes(boxes);
}

// ============================================
// QUẢN LÝ CẤU HÌNH BOX
// ============================================

function readBoxConfig() {
    if (!fs.existsSync(boxConfigPath)) {
        fs.writeJsonSync(boxConfigPath, {}, { spaces: 2 });
        return {};
    }
    try {
        return fs.readJsonSync(boxConfigPath);
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi đọc box_config:", e);
        return {};
    }
}

function writeBoxConfig(data) {
    try {
        fs.writeJsonSync(boxConfigPath, data, { spaces: 2 });
        return true;
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi ghi box_config:", e);
        return false;
    }
}

function getBoxConfig(threadId) {
    const configs = readBoxConfig();
    return configs[threadId] || null;
}

function setBoxConfig(threadId, config) {
    const configs = readBoxConfig();
    configs[threadId] = config;
    return writeBoxConfig(configs);
}

function deleteBoxConfig(threadId) {
    const configs = readBoxConfig();
    delete configs[threadId];
    return writeBoxConfig(configs);
}

// ============================================
// LẤY LOGO TỪ datateamff (ƯU TIÊN) + datateam
// ============================================

function getAllTeamData(senderId) {
    const teamLogoMap = new Map();

    const ffFile = path.join(datateamffRoot, senderId.toString(), "datateamff.json");
    if (fs.existsSync(ffFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(ffFile, "utf8"));
            for (const [teamName, teamData] of Object.entries(data)) {
                if (teamData && teamData.logo) {
                    teamLogoMap.set(teamName.toUpperCase().trim(), teamData.logo);
                }
            }
        } catch (e) {}
    }

    const oldFile = path.join(datateamRoot, senderId.toString(), "datateam.json");
    if (fs.existsSync(oldFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(oldFile, "utf8"));
            for (const [teamName, arr] of Object.entries(data)) {
                const upper = teamName.toUpperCase().trim();
                if (arr?.[0]?.logo && !teamLogoMap.has(upper)) {
                    teamLogoMap.set(upper, arr[0].logo);
                }
            }
        } catch (e) {}
    }
    return teamLogoMap;
}

// ============================================
// PARSE FUNCTIONS
// ============================================

function parseXoaToken(tokens) {
    if (!Array.isArray(tokens)) return null;
    for (const t of tokens) {
        if (typeof t !== "string") continue;
        const token = t.trim();
        const m = /^xoa\s*([\d,\s]+)$/i.exec(token);
        if (m) {
            const numbers = m[1]
                .split(",")
                .map((n) => parseInt(n.trim(), 10))
                .filter((n) => Number.isInteger(n) && n >= 1);
            return [...new Set(numbers)];
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
        if (/^slot\d+$/i.test(token)) continue;
        if (/^\d{1,2}:\d{2}$/.test(token) || /^\d{2}\/\d{2}\/\d{4}$/.test(token)) continue;
        if (/^\d{8,12}$/.test(token)) continue;
        return token;
    }
    return null;
}

function parseCprToken(tokens) {
    if (!Array.isArray(tokens)) return null;
    for (const t of tokens) {
        if (typeof t !== "string") continue;
        const m = /^cpr(\d+)$/i.exec(t);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function parseSlotToken(tokens) {
    if (!Array.isArray(tokens)) return null;
    for (const t of tokens) {
        if (typeof t !== "string") continue;
        const m = /^slot(\d+)$/i.exec(t);
        if (m) {
            const slotId = parseInt(m[1], 10);
            if (TIME_SLOTS[slotId]) return slotId;
        }
    }
    return null;
}

// ============================================
// ĐỊNH DẠNG THỜI GIAN (đồng bộ td/tdlg)
// ============================================

function formatCustomTime(startMoment) {
    return startMoment.tz(TIME_ZONE).format("DD/MM HH:mm");
}

function formatCustomTime1(startMoment) {
    return startMoment.tz(TIME_ZONE).format("HH:mm DD/MM");
}

function formatCustomTime2(startMoment) {
    return startMoment.tz(TIME_ZONE).format("HH:mm");
}

// ============================================
// KHUNG GIỜ FUNCTIONS
// ============================================

function getCurrentTimeSlot() {
    const now = moment().tz(TIME_ZONE);
    for (const [slotId, [startTime, endTime]] of Object.entries(TIME_SLOTS)) {
        let start = moment.tz(
            `${now.format("DD/MM/YYYY")} ${startTime}`,
            "DD/MM/YYYY HH:mm",
            TIME_ZONE
        );
        let end = moment.tz(
            `${now.format("DD/MM/YYYY")} ${endTime}`,
            "DD/MM/YYYY HH:mm",
            TIME_ZONE
        );
        if (end.isBefore(start)) {
            end.add(1, "day");
            if (now.isBefore(start)) {
                start.subtract(1, "day");
            }
        }
        if (now.isBetween(start, end, null, "[]")) {
            return { slotId: parseInt(slotId), start, end };
        }
    }
    return null;
}

function getTimeSlotById(slotId) {
    if (!TIME_SLOTS[slotId]) return null;
    const [startTime, endTime] = TIME_SLOTS[slotId];
    const now = moment().tz(TIME_ZONE);
    let start = moment.tz(
        `${now.format("DD/MM/YYYY")} ${startTime}`,
        "DD/MM/YYYY HH:mm",
        TIME_ZONE
    );
    let end = moment.tz(
        `${now.format("DD/MM/YYYY")} ${endTime}`,
        "DD/MM/YYYY HH:mm",
        TIME_ZONE
    );
    if (end.isBefore(start)) {
        end.add(1, "day");
    }
    return { slotId, start, end };
}

// ============================================
// CANVAS & LAYOUT
// ============================================

function ensureKeysConfig() {
    if (!fs.existsSync(keysPath)) {
        fs.writeFileSync(
            keysPath,
            JSON.stringify({
                NKNP: {
                    ct: "SCO RING",
                    ct2: "NKNP",
                    idbang: "lg1",
                    logo: "",
                    admins: [],
                    ctvs: [],
                },
            }, null, 2)
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
    if (!fs.existsSync(layoutJson)) throw new Error(`Không tìm thấy layout.json cho "${idbang}"`);
    if (!fs.existsSync(bgPath)) throw new Error(`Không tìm thấy background.png cho "${idbang}"`);
    const layoutConf = JSON.parse(fs.readFileSync(layoutJson, "utf8"));
    const bgImg = await loadImage(bgPath);
    return { layoutDir, layoutConf, bgImg };
}

function applyText(ctx, cfg, text) {
    if (!cfg || text == null) return;
    ctx.save();
    if (cfg.rotate) {
        const cx = cfg.x || 0, cy = cfg.y || 0;
        ctx.translate(cx, cy);
        ctx.rotate((cfg.rotate * Math.PI) / 180);
        ctx.translate(-cx, -cy);
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
            const imgData = tempCtx.getImageData(0, 0, logo.width, logo.height);
            const data = imgData.data;
            const target = cfg.backgroundColor || { r: 255, g: 255, b: 255 };
            const tol = cfg.tolerance || 30;
            for (let i = 0; i < data.length; i += 4) {
                const diff = Math.abs(data[i] - target.r) +
                             Math.abs(data[i + 1] - target.g) +
                             Math.abs(data[i + 2] - target.b);
                if (diff < tol) data[i + 3] = 0;
            }
            tempCtx.putImageData(imgData, 0, 0);
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
    const cfg = layoutConf.logoTop1;
    if (typeof cfg === "object" && cfg !== null && (cfg.x !== undefined || cfg.y !== undefined)) {
        await drawLogo(ctx, cfg, logoPath);
        console.log("✅ Đã vẽ thêm logo Top 1 riêng");
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
                const overlap = (t.playerAccountIds || []).filter(id => stats.playerIds.has(id)).length;
                if (overlap >= 2) { key = k; break; }
            }
            if (!key) {
                key = (t.playerAccountIds || []).sort().join(",") || `team_${Date.now()}_${Math.random()}`;
            }
            if (!teamStats.has(key)) {
                teamStats.set(key, {
                    playerIds: new Set(),
                    totalScore: 0,
                    totalKills: 0,
                    totalBooyahs: 0,
                    BooyahsGame: [],
                    isEligible: false,
                    accountNames: Array.isArray(t.accountNames) ? t.accountNames.slice() : [],
                    teamName: t.teamName || ""
                });
            } else {
                const ex = teamStats.get(key);
                if ((!ex.accountNames?.length) && t.accountNames?.length) {
                    ex.accountNames = t.accountNames.slice();
                }
                if (!ex.teamName && t.teamName) {
                    ex.teamName = t.teamName;
                }
            }
            matchKeys.set(t, key);
            (t.playerAccountIds || []).forEach(id => teamStats.get(key).playerIds.add(id));
        }

        if (mode === "cpr") {
            const booyahTeam = match.ranks.find(r => r.booyah > 0);
            if (booyahTeam) {
                const bk = matchKeys.get(booyahTeam);
                const bs = teamStats.get(bk);
                if (bs?.isEligible) {
                    champion = { teamKey: bk, matchWon: matchNumber };
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
                if (mode === "cpr" && !stats.isEligible && stats.totalScore >= cprThreshold) {
                    stats.isEligible = true;
                }
            }
        });

        if (champion) break;
    }

    let finalTeams = Array.from(teamStats.entries()).map(([key, stats]) => {
        let displayName = stats.teamName || (stats.accountNames?.[0]?.trim() ? stats.accountNames[0].trim() : "Không tên");
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

    finalTeams.forEach((t, i) => t.Top = i + 1);
    return { teams: finalTeams, champion, finalMatchCount };
}

// ============================================
// MODULE CONFIG (đổi sang chuẩn field của Zeid Bot framework)
// ============================================



// ============================================
// CHECK IS GROUP ADMIN (QTV) - dùng zca-js getGroupInfo thay cho getThreadInfo
// ============================================

async function isGroupAdmin(api, threadId, userId) {
    try {
        const info = await api.getGroupInfo(threadId);
        const groupInfo = info.gridInfoMap[threadId];
        const isCreator = groupInfo.creatorId === userId;
        const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(userId);
        return isCreator || isDeputy;
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi kiểm tra QTV:", e);
        return false;
    }
}

// ============================================
// FALLBACK: thử hôm nay → hôm qua (đồng bộ td/tdlg)
// ============================================

async function tryFindMatches(accountId, start, end) {
    try {
        const matchIds = await garenaApi.findMatches(accountId, start, end);
        if (matchIds && matchIds.length) return { matchIds, start, end };
    } catch (e) {
        console.error("[AUTOTINHDIEM] findMatches hôm nay lỗi:", e);
    }

    const yStart = moment(start).subtract(1, "day");
    const yEnd = moment(end).subtract(1, "day");
    try {
        const matchIds = await garenaApi.findMatches(accountId, yStart, yEnd);
        if (matchIds && matchIds.length) return { matchIds, start: yStart, end: yEnd };
    } catch (e) {
        console.error("[AUTOTINHDIEM] findMatches hôm qua lỗi:", e);
    }

    return null;
}

// ============================================
// HANDLE EVENT (nghe tin nhắn thường, không cần prefix) - bản Zalo
// ============================================



// ============================================
// RUN - QUẢN LÝ (lệnh có prefix, vd: .autotd on) - bản Zalo
// ============================================



// ============================================
// EXECUTE FLOW - KHÔNG TRỪ LƯỢT (bản Zalo)
// ============================================

async function executeFlow({ api, threadId, type, senderId, accountId, start, end, key = "NKNP", xoaN = null, mode = "normal", cprThreshold = null, slotId = null }) {
    let keysConf = {};
    try {
        keysConf = ensureKeysConfig();
    } catch (e) {
        return api.sendMessage("❌ " + e.message, threadId, type);
    }

    const keyConf = keysConf[key] || keysConf["NKNP"];
    if (!keyConf) {
        return api.sendMessage("❌ Không tìm thấy key và key mặc định.", threadId, type);
    }

    const isQTV = await isGroupAdmin(api, threadId, senderId);
    let hasPermission = false;

    if (isQTV) {
        const savedConfig = getBoxConfig(threadId);
        if (savedConfig && savedConfig.key === key) {
            hasPermission = true;
        }
    }

    if (!hasPermission) {
        const allowAdmins = Array.isArray(keyConf.admins) ? keyConf.admins : [];
        const allowCtvs = Array.isArray(keyConf.ctvs) ? keyConf.ctvs : [];
        if (allowAdmins.length || allowCtvs.length) {
            if (allowAdmins.includes(String(senderId)) || allowCtvs.includes(String(senderId))) {
                hasPermission = true;
            }
        } else {
            hasPermission = true;
        }
    }

    if (!hasPermission) {
        return api.sendMessage(`❌ Bạn không có quyền sử dụng key "${key}".`, threadId, type);
    }

    const found = await tryFindMatches(accountId, start, end);
    if (!found) {
        return api.sendMessage(
            `❌ Không tìm thấy trận đấu nào của ID trong khung giờ đã chọn!\n(Đã kiểm tra cả hôm nay và hôm qua)`,
            threadId, type
        );
    }

    start = found.start;
    end = found.end;

    let matchDetails = [];
    try {
        matchDetails = await garenaApi.getMatchDetails(found.matchIds);
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi getMatchDetails:", e);
        return api.sendMessage("❌ ID hết lượt hoặc Garena lỗi, thử lại sau.", threadId, type);
    }

    if (Array.isArray(xoaN) && xoaN.length) {
        const sorted = [...xoaN].sort((a, b) => b - a);
        for (const idx of sorted) {
            if (idx >= 1 && idx <= matchDetails.length) matchDetails.splice(idx - 1, 1);
        }
    }

    const { teams, champion, finalMatchCount } = aggregateTeams(matchDetails, mode, cprThreshold);
    if (!teams.length) return api.sendMessage("❌ Không có dữ liệu đội nào!", threadId, type);

    const logoFromKey = keyConf.logo && String(keyConf.logo).trim() ? keyConf.logo : null;
    const idMap = new Map();

    const userDatateamFile = path.join(datateamRoot, senderId.toString(), "datateam.json");
    if (fs.existsSync(userDatateamFile)) {
        try {
            const userDatateam = JSON.parse(fs.readFileSync(userDatateamFile, "utf8"));
            for (const [teamName, arr] of Object.entries(userDatateam)) {
                const teamData = arr[0];
                if (!teamData || !Array.isArray(teamData.accountID)) continue;
                teamData.accountID.forEach((maskedId) => {
                    const unmaskedId = maskedId.replace(/\*\*$/, "");
                    if (!idMap.has(unmaskedId)) {
                        idMap.set(unmaskedId, { teamName, logoPath: teamData.logo || null });
                    }
                });
            }
        } catch (e) {
            console.error("[AUTOTINHDIEM] Lỗi đọc datateam senderId:", e);
        }
    }

    const threadDatateamFile = path.join(datateamRoot, threadId.toString(), "datateam.json");
    if (fs.existsSync(threadDatateamFile)) {
        try {
            const threadDatateam = JSON.parse(fs.readFileSync(threadDatateamFile, "utf8"));
            for (const [teamName, arr] of Object.entries(threadDatateam)) {
                const teamData = arr[0];
                if (!teamData || !Array.isArray(teamData.accountID)) continue;
                teamData.accountID.forEach((maskedId) => {
                    const unmaskedId = maskedId.replace(/\*\*$/, "");
                    idMap.set(unmaskedId, { teamName, logoPath: teamData.logo || null });
                });
            }
        } catch (e) {
            console.error("[AUTOTINHDIEM] Lỗi đọc datateam threadId:", e);
        }
    }

    teams.forEach(team => {
        team.logoPath = null;
        for (const pid of team.playerIds) {
            const unmPid = String(pid).replace(/\*\*$/, "");
            if (idMap.has(unmPid)) {
                const info = idMap.get(unmPid);
                team.displayName = info.teamName;
                team.logoPath = info.logoPath;
                break;
            }
        }
        if (!team.logoPath) team.logoPath = logoFromKey;
    });

    const layoutId = keyConf.idbang || "lg1";
    let layoutPack;
    try {
        layoutPack = await loadLayoutById(layoutId);
    } catch (e) {
        return api.sendMessage("❌ " + e.message, threadId, type);
    }

    try {
        const { layoutConf, bgImg } = layoutPack;
        const canvas = createCanvas(bgImg.width, bgImg.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bgImg, 0, 0);

        const customName = keyConf.ct || key;
        const customName2 = keyConf.ct2 || key;

        const customTime  = formatCustomTime(start);
        const customTime1 = formatCustomTime1(start);
        const customTime2 = formatCustomTime2(start);

        if (layoutConf.header) {
            if (layoutConf.header.customName)  applyText(ctx, layoutConf.header.customName, customName);
            if (layoutConf.header.customName2) applyText(ctx, layoutConf.header.customName2, customName2);
            if (layoutConf.header.customTime)  applyText(ctx, layoutConf.header.customTime, customTime);
            if (layoutConf.header.customTime1) applyText(ctx, layoutConf.header.customTime1, customTime1);
            if (layoutConf.header.customTime2) applyText(ctx, layoutConf.header.customTime2, customTime2);

            if (Array.isArray(layoutConf.header.logos)) {
                for (let i = 0; i < teams.length; i++) {
                    const logoCfg = layoutConf.header.logos[i];
                    if (teams[i].logoPath && logoCfg) await drawLogo(ctx, logoCfg, teams[i].logoPath);
                }
                for (const ck of ["custom1", "custom2", "custom3"]) {
                    const cl = layoutConf.header.logos.find(l => String(l.top).toLowerCase() === ck);
                    if (cl && logoFromKey) await drawLogo(ctx, cl, logoFromKey);
                }
            }
        }

        if (logoFromKey) {
            await drawTop1Logo(ctx, layoutConf, logoFromKey);
        }

        const maxRow = layoutConf.limit || 10;
        const rows = Math.min(maxRow, teams.length);

        for (let i = 0; i < rows; i++) {
            const team = teams[i];

            const fristRankLayout = layoutConf.fristRanks;
            if (fristRankLayout && Array.isArray(fristRankLayout)) {
                const fristRankConfig = fristRankLayout[i];
                if (fristRankConfig !== undefined) {
                    if (fristRankConfig.Name)   applyText(ctx, fristRankConfig.Name, team.displayName);
                    if (fristRankConfig.Kill)   applyText(ctx, fristRankConfig.Kill, pad2(team.totalKills));
                    if (fristRankConfig.Booyah) applyText(ctx, fristRankConfig.Booyah, pad2(team.totalBooyahs));
                    if (fristRankConfig.Score)  applyText(ctx, fristRankConfig.Score, pad2(team.totalScore));
                }
            }

            const slotCfg = layoutConf[`Top${i + 1}`];
            if (!slotCfg) continue;
            const name = team.displayName || "Không tên";
            if (slotCfg.Top)    applyText(ctx, slotCfg.Top, String(team.Top || i + 1));
            if (slotCfg.Name)   applyText(ctx, slotCfg.Name, name);
            if (slotCfg.Kill)   applyText(ctx, slotCfg.Kill, pad2(team.totalKills));
            if (slotCfg.Booyah) applyText(ctx, slotCfg.Booyah, pad2(team.totalBooyahs));
            if (slotCfg.Score)  applyText(ctx, slotCfg.Score, pad2(team.totalScore));
            if (team.logoPath && slotCfg.Logo) await drawLogo(ctx, slotCfg.Logo, team.logoPath);
        }

        const top1Team = teams[0];
        const top1ExtraCfg = layoutConf["Top1_extra"];
        if (top1Team && top1ExtraCfg) {
            if (top1ExtraCfg.Top)    applyText(ctx, top1ExtraCfg.Top, String(top1Team.Top || 1));
            if (top1ExtraCfg.Name)   applyText(ctx, top1ExtraCfg.Name, top1Team.displayName || "Không tên");
            if (top1ExtraCfg.Kill)   applyText(ctx, top1ExtraCfg.Kill, pad2(top1Team.totalKills));
            if (top1ExtraCfg.Booyah) applyText(ctx, top1ExtraCfg.Booyah, pad2(top1Team.totalBooyahs));
            if (top1ExtraCfg.Score)  applyText(ctx, top1ExtraCfg.Score, pad2(top1Team.totalScore));
        }

        if (layoutConf.BooyahGames) {
            for (const team of teams) {
                if (!team.BooyahsGame?.length) continue;
                for (const g of team.BooyahsGame) {
                    const cfg = layoutConf.BooyahGames[`Game${g}`];
                    if (cfg) applyText(ctx, cfg, team.displayName);
                    if (Array.isArray(layoutConf.BooyahGames.LogosBooyah)) {
                        const lc = layoutConf.BooyahGames.LogosBooyah.find(l => l.game === g);
                        if (lc && logoFromKey) await drawLogo(ctx, lc, logoFromKey);
                    }
                }
            }
        }

        const outPath = path.join(bxhRoot, `bxh-${layoutId}-${key}-${Date.now()}.png`);
        fs.writeFileSync(outPath, canvas.toBuffer());

        let msgBody = "🤖 NKNP BOT 🤖\n\n";
        msgBody += `📊 ID: ${accountId}\n`;
        msgBody += `🎯 Số Trận: ${finalMatchCount}\n`;
        msgBody += `⌛ Khung Giờ: ${start.format("HH:mm")} | ${end.format("HH:mm DD/MM")}\n`;
        msgBody += `🔑 Key: ${key}\n`;

        if (mode === "cpr" && cprThreshold) {
            msgBody += `🏆 Chế Độ: CPR ${cprThreshold} Điểm\n`;
        } else {
            msgBody += `🏆 Chế Độ: Thường\n`;
        }

        if (xoaN && xoaN.length > 0) msgBody += `🗑 Xóa Trận: ${xoaN.join(", ")}\n`;
        msgBody += "\n";

        if (mode === "cpr") {
            if (champion) {
                const champTeam = teams.find(t => t.teamKey === champion.teamKey);
                if (champTeam) {
                    msgBody += `🥇 Vô địch CPR: ${champTeam.displayName}\n`;
                    msgBody += `🎯 Booyah ở trận thứ: ${champion.matchWon}\n`;
                }
            } else {
                msgBody += `🏆 Vô địch CPR: Chưa có\n`;
            }
        }

        try {
            await api.sendMessage({ msg: msgBody, attachments: outPath }, threadId, type);
        } catch (err) {
            console.error("[AUTOTINHDIEM] Lỗi gửi ảnh:", err);
        } finally {
            try { fs.unlinkSync(outPath); } catch {}
        }

    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi tạo ảnh:", e);
        api.sendMessage("❌ Lỗi tạo bảng xếp hạng: " + e.message, threadId, type);
    }
}

const __legacyConfig = {
    name: "autotd",
    version: "7.6.0-zalo",
    role: 0, // mọi người dùng được lệnh gốc (help/status); phân quyền chi tiết xử lý thủ công bên trong
    author: "NKNP",
    description: "Tính Điểm Tự Động - Chỉ QTV nhóm tính điểm",
    category: "Game",
    usage: "[ID] [key] [slotN] [xoaN] [cprN] hoặc: on/off/set/config/reset",
    cooldowns: 5,
    dependencies: {
        "moment-timezone": "",
        "fs-extra": "",
        "canvas": ""
    }
};
const __legacyRun = async ({ api, event, args }) => {
    const { threadId, type, data } = event;
    const userId = data.uidFrom;

    // Framework này không tự cấp sẵn biến "permssion" theo cấp bậc như GoatBot,
    // nên tự tính lại tại đây: 2 = admin bot, 1 = QTV nhóm, 0 = thành viên thường.
    const isBotAdmin = global.users?.admin?.includes(userId);
    const isQTVUser = type === ThreadType.Group ? await isGroupAdmin(api, threadId, userId) : false;
    const permssion = isBotAdmin ? 2 : (isQTVUser ? 1 : 0);

    // ================== BẬT / TẮT ==================
    if (args[0] === "on" || args[0] === "off") {
        if (permssion < 2) {
            return api.sendMessage("⚠️ Chỉ **admin bot** mới bật/tắt được tính năng autotd.", threadId, type);
        }
        const status = args[0] === "on";
        if (setBoxStatus(threadId, status)) {
            return api.sendMessage(
                `✅ Đã ${status ? "BẬT" : "TẮT"} autotd cho nhóm này.\n\nChúc các idol mau lm vua.`,
                threadId, type
            );
        }
        return api.sendMessage("❌ Lỗi khi thay đổi trạng thái.", threadId, type);
    }

    if (["set", "config", "status", "reset"].includes(args[0])) {
        if (permssion < 1) {
            return api.sendMessage("⚠️ Chỉ **QTV nhóm** mới dùng được lệnh này.", threadId, type);
        }
    }

    // ================== SET CẤU HÌNH ==================
    if (args[0] === "set") {
        const keyInput = args[1];
        if (!keyInput) return api.sendMessage(
            "❌ Vui lòng nhập key!\nVD: .autotd set NKNP\n    .autotd set NKNP 3\n    .autotd set NKNP 3 cpr50",
            threadId, type
        );

        let slotId = null;
        let cprVal = null;

        for (let i = 2; i < args.length; i++) {
            const a = args[i].trim();
            const slotMatch = /^slot(\d+)$/i.exec(a) || /^(\d+)$/.exec(a);
            const cprMatch = /^cpr(\d+)$/i.exec(a);

            if (cprMatch) {
                cprVal = parseInt(cprMatch[1], 10);
            } else if (slotMatch) {
                const sid = parseInt(slotMatch[1], 10);
                if (TIME_SLOTS[sid]) slotId = sid;
                else return api.sendMessage("❌ Khung giờ không hợp lệ! (1-8)", threadId, type);
            }
        }

        const config = {
            key: keyInput,
            slotId: slotId || null,
            cpr: cprVal,
            lastUsed: moment().tz(TIME_ZONE).format()
        };

        if (setBoxConfig(threadId, config)) {
            let msg = `✅ Đã lưu cấu hình cho box:\n`;
            msg += `📌 Key: ${keyInput}\n`;
            if (slotId) {
                const slot = TIME_SLOTS[slotId];
                msg += `⏰ Khung: ${slotId} (${slot[0]} - ${slot[1]})\n`;
            } else {
                msg += `⏰ Khung: Tự động\n`;
            }
            if (cprVal !== null) {
                msg += `🏆 Chế độ: CPR ${cprVal} điểm\n`;
            } else {
                msg += `🏆 Chế độ: Thường\n`;
            }
            msg += `\n✅ Tất cả **QTV nhóm** đều được sử dụng key này.\n`;
            msg += `💡 Gửi ID game → bot tính điểm ngay!`;
            return api.sendMessage(msg, threadId, type);
        }
        return api.sendMessage("❌ Lỗi khi lưu cấu hình.", threadId, type);
    }

    // ================== SET CPR RIÊNG ==================
    if (args[0] === "cpr") {
        if (permssion < 1) {
            return api.sendMessage("⚠️ Chỉ **QTV nhóm** mới dùng được lệnh này.", threadId, type);
        }

        const saved = getBoxConfig(threadId);

        if (args[1] === "off" || args[1] === "0") {
            const newConfig = { ...(saved || {}), cpr: null, lastUsed: moment().tz(TIME_ZONE).format() };
            if (setBoxConfig(threadId, newConfig)) {
                return api.sendMessage(
                    `✅ Đã TẮT chế độ CPR.\n🏆 Chế độ: Thường\n💡 Gửi ID game → bot tính điểm thường!`,
                    threadId, type
                );
            }
        }

        const rawVal = args[1] ? args[1].replace(/^cpr/i, "") : null;
        const cprVal = rawVal ? parseInt(rawVal, 10) : null;

        if (!cprVal || isNaN(cprVal) || cprVal <= 0) {
            return api.sendMessage(
                "❌ Vui lòng nhập số điểm CPR!\nVD: .autotd cpr 50\n    .autotd cpr off (để tắt CPR)",
                threadId, type
            );
        }

        const newConfig = { ...(saved || {}), cpr: cprVal, lastUsed: moment().tz(TIME_ZONE).format() };
        if (setBoxConfig(threadId, newConfig)) {
            return api.sendMessage(
                `✅ Đã BẬT chế độ CPR!\n🏆 CPR: ${cprVal} điểm\n💡 Gửi ID game → bot tự động tính CPR ${cprVal}!`,
                threadId, type
            );
        }
        return api.sendMessage("❌ Lỗi khi lưu cấu hình CPR.", threadId, type);
    }

    // ================== CONFIG / STATUS ==================
    if (args[0] === "config" || args[0] === "status") {
        const enabled = isBoxEnabled(threadId);
        const saved = getBoxConfig(threadId);
        const current = getCurrentTimeSlot();

        let msg = `📊 Autotinhdiem: ${enabled ? "✅ BẬT" : "❌ TẮT"}\n\n`;
        if (saved) {
            msg += `💾 Cấu hình:\n`;
            msg += `  📌 Key: ${saved.key}\n`;
            if (saved.slotId) {
                const s = TIME_SLOTS[saved.slotId];
                msg += `  ⏰ Khung: ${saved.slotId} (${s[0]} - ${s[1]})\n`;
            } else {
                msg += `  ⏰ Khung: Tự động\n`;
            }
            if (saved.cpr !== null && saved.cpr !== undefined) {
                msg += `  🏆 CPR: ${saved.cpr} điểm\n`;
            } else {
                msg += `  🏆 Chế độ: Thường\n`;
            }
        } else {
            msg += `💾 Chưa có cấu hình\n`;
        }

        msg += `\n⏰ Khung hiện tại: `;
        if (current) {
            msg += `${current.slotId}: ${current.start.format("HH:mm")} - ${current.end.format("HH:mm")}`;
        } else {
            msg += `❌ Không trong khung giờ`;
        }

        msg += `\n\n📌 Quyền:\n• Admin bot: on/off\n• QTV nhóm: set/cpr/config/reset + tính điểm`;
        return api.sendMessage(msg, threadId, type);
    }

    // ================== RESET ==================
    if (args[0] === "reset") {
        if (deleteBoxConfig(threadId)) {
            return api.sendMessage("✅ Đã xóa cấu hình box này!", threadId, type);
        }
        return api.sendMessage("❌ Lỗi khi xóa cấu hình.", threadId, type);
    }

    // ================== HƯỚNG DẪN ==================
    return api.sendMessage(
        "🔰 AUTOTINHDIEM - HƯỚNG DẪN\n" +
        "━━━━━━━━━━━━━━━━━━━\n\n" +
        "⚙️ Quản lý (chỉ Admin bot):\n" +
        "  .autotd on | off\n\n" +
        "⚙️ Cấu hình (chỉ QTV nhóm):\n" +
        "  .autotd set <key> [slot] [cprN]\n" +
        "  .autotd cpr <số điểm>\n" +
        "  .autotd cpr off\n" +
        "  .autotd config\n" +
        "  .autotd reset\n\n" +
        "📝 Tính điểm:\n" +
        "  • QTV chỉ cần gửi ID game trong khung giờ\n" +
        "  • Hoặc: ID [key] [slotN] [xoaN] [cprN]\n\n" +
        "⏰ Khung giờ:\n" +
        "1:13-15  5:21:40-23  8:10-12\n" +
        "2:15-17  6:23-02\n" +
        "3:18-20  7:02-05\n" +
        "4:20-21:50",
        threadId, type
    );
};
const __legacyHandleEvent = async ({ api, event, Threads }) => {
    const { threadId, type, data } = event;

    // Chỉ xử lý trong nhóm, và chỉ với tin nhắn văn bản thuần (webchat)
    if (type !== ThreadType.Group) return;
    if (data?.msgType !== "webchat" || typeof data?.content !== "string") return;

    const body = data.content;
    const senderId = data.uidFrom;
    if (!body || !senderId) return;

    if (!isBoxEnabled(threadId)) return;

    const isAdmin = await isGroupAdmin(api, threadId, senderId);
    if (!isAdmin) return;

    try {
        const limitData = fs.readJsonSync(limitPath, { throws: false }) || {};
        if (limitData[threadId]?.game === false) return;
    } catch (e) {
        console.error("[AUTOTINHDIEM] Lỗi đọc limit:", e);
    }

    // Bỏ qua nếu đây là 1 lệnh có prefix (tránh xung đột với các lệnh khác)
    const threadInfo = (await Threads.getData(threadId)).data || {};
    const prefix = threadInfo.prefix || global.config.prefix;
    if (body.startsWith(prefix)) return;

    const parts = body.split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
    const accountId = parts.find(p => /^\d{8,12}$/.test(p) && !/^mk:/i.test(p));
    if (!accountId) return;

    const savedConfig = getBoxConfig(threadId);

    const xoaN = parseXoaToken(parts);
    const keyFromMsg = parseKeyToken(parts);
    const slotFromMsg = parseSlotToken(parts);

    const cprFromMsg = parseCprToken(parts);
    const cpr = cprFromMsg !== null
        ? cprFromMsg
        : (savedConfig?.cpr ?? null);

    const key = keyFromMsg || savedConfig?.key || "NKNP";
    const slotId = slotFromMsg || savedConfig?.slotId || null;

    if (keyFromMsg || slotFromMsg || cprFromMsg !== null) {
        const newConfig = {
            key: keyFromMsg || savedConfig?.key || "NKNP",
            slotId: slotFromMsg || savedConfig?.slotId || null,
            cpr: cprFromMsg !== null ? cprFromMsg : (savedConfig?.cpr ?? null),
            lastUsed: moment().tz(TIME_ZONE).format()
        };
        setBoxConfig(threadId, newConfig);
    }

    let timeSlot;
    if (slotId) {
        timeSlot = getTimeSlotById(slotId);
        if (!timeSlot) {
            return api.sendMessage(`❌ Khung giờ ${slotId} không hợp lệ!`, threadId, type);
        }
    } else {
        timeSlot = getCurrentTimeSlot();
        if (!timeSlot) return;
    }

    const mode = cpr !== null ? "cpr" : "normal";

    await api.sendMessage("Bắt Đầu Tính Điểm Vui Lòng Chờ Trong Giây Lát 🔁", threadId, type);

    await executeFlow({
        api,
        threadId,
        type,
        senderId,
        accountId,
        start: timeSlot.start,
        end: timeSlot.end,
        key,
        xoaN,
        mode,
        cprThreshold: cpr,
        slotId: timeSlot.slotId
    });
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, __legacyHandleEvent);
