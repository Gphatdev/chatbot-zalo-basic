/**
 * [PORT SANG NKNP V3 / zca-mt] profile.js (lệnh "profile")
 * Chuyển từ phong cách FCA (Facebook Messenger) sang zca-mt (Zalo), dùng
 * LegacyBridge (wrapLegacyCommand) — xem Core/LegacyBridge.js. Cùng chuẩn
 * chuyển đổi với boxscrim.js/lineup.js/qrin.js đã port trước đó.
 *
 * @author HNHANN STUDIO — port zca-mt: NKNP STUDIO
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../LegacyBridge.js";

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');

const REPLY_NAME = "profile";

// 🆕 FIX (Zalo): Map toàn cục lưu state "đang chờ reply" theo msgId.
global.client = global.client || {};
global.client.handleReply = global.client.handleReply instanceof Map
  ? global.client.handleReply
  : new Map();

// 🔧 FIX (Zalo): xoá tin nhắn trạng thái của bot bằng api.deleteMessage
// (thay cho api.unsendMessage(id, cb) / api.deleteMessage(id, cb) kiểu FCA).
async function tryDeleteOwnMessage(api, threadId, type, sentInfo) {
    if (!api || typeof api.deleteMessage !== "function" || !sentInfo) return false;
    const msgId = sentInfo?.message?.msgId || sentInfo?.msgId;
    const cliMsgId = sentInfo?.message?.cliMsgId || sentInfo?.cliMsgId;
    if (!msgId && !cliMsgId) return false;
    try {
        let ownId;
        try { ownId = typeof api.getOwnId === "function" ? api.getOwnId() : undefined; } catch {}
        await api.deleteMessage({ data: { cliMsgId, msgId, uidFrom: ownId }, threadId, type });
        return true;
    } catch (e) {
        console.error("[PROFILE] Lỗi khi xóa tin nhắn trạng thái:", e?.message);
        return false;
    }
}

const BASE_PATH = path.join(__dirname, '..', '..', 'ff_profile_supreme_v4');
const PATHS = {
    ROOT: BASE_PATH,
    PHOI: path.join(BASE_PATH, 'phoi'),
    FONTS: path.join(BASE_PATH, 'fonts'),
    DATA: path.join(BASE_PATH, 'data'),
    CACHE: path.join(BASE_PATH, 'cache'),
    TEMP: path.join(BASE_PATH, 'temp'),
    SKILLS: path.join(BASE_PATH, 'cache/skills'),
    GUNS: path.join(BASE_PATH, 'cache/guns'),
    CHARS: path.join(BASE_PATH, 'cache/chars'),
    LOGS: path.join(BASE_PATH, 'logs'),
    PAYMENT: path.join(__dirname, 'data', 'Luotdung')
};

const FILES = {
    CHAR_DATA: path.join(PATHS.DATA, 'nhanvat.json'),
    GUN_DATA: path.join(PATHS.DATA, 'sung.json'),
    LAYOUT_CONFIG: path.join(PATHS.DATA, 'layout_map.json'),
    FONT_BOLD: path.join(PATHS.FONTS, 'Montserrat-Bold.ttf'),
    SYSTEM_LOG: path.join(PATHS.LOGS, 'process.log'),
    USER_TURNS: path.join(PATHS.PAYMENT, 'bank_user_turns.json'),
    LIMIT: path.join(PATHS.CACHE, 'limit.json'),
    AUTH: path.join(PATHS.PAYMENT, 'authorized_users.json')
};

// === UTILITY FUNCTIONS ===
function readJsonFile(filePath, defaultValue = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return defaultValue;
        }
        const rawData = fs.readFileSync(filePath);
        return rawData.length > 0 ? JSON.parse(rawData) : defaultValue;
    } catch (error) {
        return defaultValue;
    }
}

function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {}
}

// 🔧 FIX (Zalo): api.getUserInfo trả về { changed_profiles / unchanged_profiles / [uid] }.
async function getUserName(api, Users, uid) {
    try {
        const nameFromCache = (await Users.getData(uid))?.name;
        if (nameFromCache) return nameFromCache;
    } catch (error) {}
    try {
        const info = await api.getUserInfo(uid);
        const profile = info?.changed_profiles?.[uid] || info?.unchanged_profiles?.[uid] || info?.[uid] || null;
        const name = profile?.displayName || profile?.zaloName || profile?.name;
        if (name) return name;
    } catch (error) {}
    return `User ${uid}`;
}

async function autoUpdateNickname(api, threadId, userID, userName, turns) {
    try {
        const newNickname = `${userName} | ${turns} lượt`;
        await api.changeNickname(newNickname, threadId, userID);
        return true;
    } catch (error) {
        return false;
    }
}

function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

function getSuggestions(input, list, max = 3) {
    input = input.toLowerCase().trim();
    return list
        .map(item => ({ item, dist: levenshtein(input, item.toLowerCase()) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, max)
        .map(x => x.item);
}

function checkLimit(threadId, commandName) {
    const limitData = readJsonFile(FILES.LIMIT, {});
    if (!limitData[threadId]) return true;
    const commandGroups = {
        game: ["profile", "1key", "1hoso", "tinhdiem", "tinhdiemlogo"],
        anti: ["antiout", "antijoin"],
        autopost: ["custom"]
    };
    for (const [groupKey, commands] of Object.entries(commandGroups)) {
        if (commands.includes(commandName)) {
            return limitData[threadId][groupKey] !== false;
        }
    }
    return true;
}

function deductTurns(userID, amount = 1) {
    const data = readJsonFile(FILES.USER_TURNS, {});
    const current = data[userID] || 0;
    if (current < amount) return false;
    data[userID] = current - amount;
    writeJsonFile(FILES.USER_TURNS, data);
    return true;
}

// === INITIALIZATION & LAYOUT CONFIGURATION ===
const initializeSystem = async () => {
    for (const key in PATHS) {
        if (!fs.existsSync(PATHS[key])) fs.mkdirSync(PATHS[key], { recursive: true });
    }

    if (!fs.existsSync(FILES.FONT_BOLD)) {
        try {
            const fontRes = await axios.get("https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Bold.ttf", { responseType: 'arraybuffer' });
            fs.writeFileSync(FILES.FONT_BOLD, Buffer.from(fontRes.data));
        } catch (e) {}
    }
    if (fs.existsSync(FILES.FONT_BOLD)) registerFont(FILES.FONT_BOLD, { family: 'FF_Bold', weight: 'bold' });

    const fullLayouts = {
        vang: {
            bgUrl: "https://files.catbox.moe/rh2fjl.png",
            canvas: { width: 1920, height: 1080 },
            assets: {
                weaponSlot1: { x: 850, y: 530, w: 480, h: 230, rotate: 24 },
                weaponSlot2: { x: 1120, y: 525, w: 480, h: 230, rotate: 24 },
                skills: [{ x: 965, y: 820, r: 70 }, { x: 1135, y: 820, r: 70 }, { x: 1300, y: 820, r: 70 }, { x: 1465, y: 820, r: 70 }]
            },
            textMap: {
                nickname: { x: 450, y: 870, size: 55, color: "#FFFFFF", align: "center", neon: false },
                team: { x: 1311, y: 415, size: 42, color: "#FFFFFF", align: "center", neon: false },
                realName: { x: 1311, y: 260, size: 36, color: "#FFFFFF", align: "center", neon: false },
                position: { x: 1311, y: 488, size: 42, color: "#FFFFFF", align: "center", neon: false },
                birthday: { x: 1311, y: 345, size: 42, color: "#FFFFFF", align: "center", neon: false },
                studio: { x: 960, y: 1045, size: 50, color: "#FFFFFF", align: "center", text: "HNHANN STUDIO", neon: false }
            }
        },
        goku: {
            bgUrl: "https://files.catbox.moe/z9jk39.PNG",
            canvas: { width: 1920, height: 1080 },
            assets: {
                weaponSlot1: { x: 1243, y: 862, w: 400, h: 200, rotate: 24 },
                weaponSlot2: { x: 1422, y: 862, w: 400, h: 200, rotate: 24 },
                skills: [{ x: 1040, y: 749, r: 60 }, { x: 1167, y: 749, r: 60 }, { x: 1294, y: 749, r: 60 }, { x: 1421, y: 749, r: 60 }]
            },
            textMap: {
                nickname: { x: 1363, y: 346, size: 43, color: "#FFFFFF", align: "center", neon: false },
                realName: { x: 1220, y: 510, size: 36, color: "#FFFFFF", align: "center", neon: false },
                team: { x: 1321, y: 397, size: 40, color: "#FFFFFF", align: "left", neon: false },
                position: { x: 1220, y: 692, size: 42, color: "#FFFFFF", align: "center", neon: false },
                birthday: { x: 1220, y: 595, size: 42, color: "#FFFFFF", align: "center", neon: false },
                studio: { x: 620, y: 9000, size: 40, color: "#FFFFFF", align: "center", text: "HNHANN STUDIO", neon: false }
            }
        },
        oscar: {
            bgUrl: "https://files.catbox.moe/chktup.PNG",
            canvas: { width: 1920, height: 1080 },
            assets: {
                weaponSlot1: { x: 1243, y: 862, w: 400, h: 200, rotate: 24 },
                weaponSlot2: { x: 1422, y: 862, w: 400, h: 200, rotate: 24 },
                skills: [{ x: 1040, y: 749, r: 60 }, { x: 1167, y: 749, r: 60 }, { x: 1294, y: 749, r: 60 }, { x: 1421, y: 749, r: 60 }]
            },
            textMap: {
                nickname: { x: 1363, y: 330, size: 43, color: "#FFFFFF", align: "center", neon: false },
                realName: { x: 1220, y: 510, size: 36, color: "#FFFFFF", align: "center", neon: false },
                team: { x: 1321, y: 413, size: 40, color: "#FFFFFF", align: "left", neon: false },
                position: { x: 1220, y: 687, size: 42, color: "#FFFFFF", align: "center", neon: false },
                birthday: { x: 1220, y: 595, size: 42, color: "#FFFFFF", align: "center", neon: false },
                studio: { x: 620, y: 1058, size: 40, color: "#FFFFFF", align: "center", text: "HNHANN STUDIO", neon: false }
            }
        },
        nagi: {
            bgUrl: "https://files.catbox.moe/5ye08r.png",
            canvas: { width: 1920, height: 1080 },
            assets: {
                weaponSlot1: { x: 1243, y: 862, w: 400, h: 200, rotate: 24 },
                weaponSlot2: { x: 1422, y: 862, w: 400, h: 200, rotate: 24 },
                skills: [{ x: 1040, y: 749, r: 60 }, { x: 1167, y: 749, r: 60 }, { x: 1294, y: 749, r: 60 }, { x: 1421, y: 749, r: 60 }]
            },
            textMap: {
                nickname: { x: 1363, y: 330, size: 43, color: "#FFFFFF", align: "center", neon: false },
                realName: { x: 1220, y: 510, size: 36, color: "#FFFFFF", align: "center", neon: false },
                team: { x: 1321, y: 413, size: 40, color: "#FFFFFF", align: "left", neon: false },
                position: { x: 1220, y: 687, size: 42, color: "#FFFFFF", align: "center", neon: false },
                birthday: { x: 1220, y: 595, size: 42, color: "#FFFFFF", align: "center", neon: false },
                studio: { x: 620, y: 1058, size: 40, color: "#FFFFFF", align: "center", text: "HNHANN STUDIO", neon: false }
            }
        },
        itachi: {
            bgUrl: "https://files.catbox.moe/2ifzc4.PNG",
            canvas: { width: 1920, height: 1080 },
            assets: {
                weaponSlot1: { x: 1243, y: 862, w: 400, h: 200, rotate: 24 },
                weaponSlot2: { x: 1422, y: 862, w: 400, h: 200, rotate: 24 },
                skills: [{ x: 1040, y: 749, r: 60 }, { x: 1167, y: 749, r: 60 }, { x: 1294, y: 749, r: 60 }, { x: 1421, y: 749, r: 60 }]
            },
            textMap: {
                nickname: { x: 1363, y: 330, size: 43, color: "#FFFFFF", align: "center", neon: false },
                realName: { x: 1220, y: 510, size: 36, color: "#FFFFFF", align: "center", neon: false },
                team: { x: 1321, y: 413, size: 40, color: "#FFFFFF", align: "left", neon: false },
                position: { x: 1220, y: 687, size: 42, color: "#FFFFFF", align: "center", neon: false },
                birthday: { x: 1220, y: 595, size: 42, color: "#FFFFFF", align: "center", neon: false },
                studio: { x: 620, y: 1058, size: 40, color: "#FFFFFF", align: "center", text: "HNHANN STUDIO", neon: false }
            }
        },
        layout06: {
            bgUrl: "https://files.catbox.moe/wlrvqs.png",
            canvas: { width: 1920, height: 1080 },
            assets: {
                weaponSlot1: { x: 1260, y: 290, w: 550, h: 220, rotate: 0 },
                skills: [
                    { x: 1480, y: 840, r: 80 },
                    { x: 1550, y: 550, r: 140 },
                    { x: 1300, y: 840, r: 80 },
                    { x: 1630, y: 840, r: 80 }
                ]
            },
            textMap: {
                team: { x: 230, y: 360, size: 40, color: "#FFFFFF", align: "left", neon: false },
                birthday: { x: 130, y: 540, size: 55, color: "#F0CF91", align: "left", neon: false },
                nickname: { x: 130, y: 750, size: 55, color: "#F0CF91", align: "left", neon: false },
                position: { x: 130, y: 950, size: 55, color: "#F0CF91", align: "left", neon: false },
                realName: { x: -100, y: -100, size: 1, color: "#FFF", align: "center", neon: false },
                studio: { x: 960, y: 70, size: 30, color: "#FFFFFF", align: "center", text: "HNHANN STUDIO", neon: false }
            }
        }
    };

    fs.writeJsonSync(FILES.LAYOUT_CONFIG, fullLayouts, { spaces: 4 });
};

// === IMAGE FUNCTIONS ===
async function getImg(url, cat, id) {
    const fileName = `${id.toString().replace(/\s/g, '_')}.png`;
    const p = path.join(PATHS.CACHE, cat, fileName);
    if (fs.existsSync(p)) {
        try { return await loadImage(p); }
        catch (e) { fs.unlinkSync(p); }
    }
    try {
        const r = await axios.get(url, { responseType: 'arraybuffer' });
        fs.outputFileSync(p, Buffer.from(r.data));
        return await loadImage(Buffer.from(r.data));
    } catch (e) { return null; }
}

function drawTextNormal(ctx, txt, conf) {
    if (!txt || !conf) return;
    ctx.save();
    ctx.textAlign = conf.align || "center";
    ctx.font = `bold ${conf.size || 40}px FF_Bold`;

    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = conf.color || "#FFFFFF";

    ctx.fillText(txt, conf.x, conf.y);
    ctx.restore();
}

async function renderSupremeProfile(input) {
    const config = fs.readJsonSync(FILES.LAYOUT_CONFIG);
    const layout = config[input.template] || config.vang;
    const canvas = createCanvas(layout.canvas.width, layout.canvas.height);
    const ctx = canvas.getContext('2d');

    const bg = await getImg(layout.bgUrl, 'phoi', `phoi_${input.template}`);
    if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    const chars = readJsonFile(FILES.CHAR_DATA, []);
    const guns = readJsonFile(FILES.GUN_DATA, []);

    const gNames = input.gunIds.split(',').map(x => x.trim());
    for (let i = 0; i < 2; i++) {
        if (!gNames[i]) continue;
        const gData = guns.find(x =>
            x.id == gNames[i] ||
            x.name.toLowerCase().includes(gNames[i].toLowerCase())
        );
        if (gData) {
            const gImg = await getImg(gData.url, 'guns', gData.name);
            const slot = layout.assets[`weaponSlot${i + 1}`];
            if (slot && gImg) {
                ctx.save();
                const centerX = slot.x + slot.w / 2;
                const centerY = slot.y + slot.h / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate((slot.rotate || 0) * Math.PI / 180);
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 10;
                ctx.drawImage(gImg, -slot.w / 2, -slot.h / 2, slot.w, slot.h);
                ctx.restore();
            }
        }
    }

    const sNames = input.skillIds.split(',').map(x => x.trim());
    for (let i = 0; i < 4; i++) {
        if (!sNames[i]) continue;
        const sData = chars.find(x =>
            x.id == sNames[i] ||
            x.name.toLowerCase().includes(sNames[i].toLowerCase())
        );
        if (sData) {
            const sImg = await getImg(sData.url, 'skills', sData.name);
            const slot = layout.assets.skills[i];
            if (slot && sImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(slot.x + slot.r, slot.y + slot.r, slot.r, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(sImg, slot.x, slot.y, slot.r * 2, slot.r * 2);
                ctx.restore();
            }
        }
    }

    const tMap = layout.textMap;
    drawTextNormal(ctx, input.nickname, tMap.nickname);
    drawTextNormal(ctx, input.team, tMap.team);
    drawTextNormal(ctx, input.realName, tMap.realName);
    drawTextNormal(ctx, input.position, tMap.position);
    drawTextNormal(ctx, input.birthday, tMap.birthday);

    if (tMap.studio) {
        const textToShow = input.studioText || tMap.studio.text || "HNHANN STUDIO";
        drawTextNormal(ctx, textToShow, tMap.studio);
    }

    return canvas.toBuffer();
}

async function processFinalRender(api, event, Users, d, studioText = null) {
    const { threadId, type, data } = event;
    const senderID = data.uidFrom;

    const success = deductTurns(senderID, 1);
    if (!success) {
        return api.sendMessage("❌ Bạn không còn đủ lượt để tạo profile. Vui lòng nạp thêm lượt rồi thử lại.", threadId, type);
    }

    const statusInfo = await api.sendMessage("⏳ HNHANN STUDIO đang xử lý thiết kế của bạn. Vui lòng chờ trong giây lát...\n✨ HNHANN STUDIO ✨", threadId, type);

    try {
        const buf = await renderSupremeProfile({ ...d, studioText });
        const p = path.join(PATHS.TEMP, `hnhann_supreme_${senderID}.png`);
        fs.writeFileSync(p, buf);

        const userName = await getUserName(api, Users, senderID);
        const newTurns = readJsonFile(FILES.USER_TURNS, {})[senderID] || 0;
        await autoUpdateNickname(api, threadId, senderID, userName, newTurns);

        const feeMsg = `${newTurns} lượt`;

        await api.sendMessage({
            msg: `✨ HNHANN STUDIO ✨\n✅ Profile đã được thiết kế hoàn tất.\n💎 Số lượt còn lại: ${feeMsg}`,
            attachments: p
        }, threadId, type);

        try { fs.unlinkSync(p); } catch {}
        await tryDeleteOwnMessage(api, threadId, type, statusInfo);
    } catch (e) {
        api.sendMessage("❌ Lỗi hệ thống: " + e.message, threadId, type);
    }
}

initializeSystem();

const __legacyConfig = {
    name: "profile",
    version: "71.0.7",
    role: 0,
    author: "HNHANN STUDIO",
    description: "Tạo Profile FF - Phục hồi tự động toàn bộ layout",
    category: "Game",
    usages: "[Chọn layout và làm theo hướng dẫn | Gõ 'profile test' để xem mẫu]",
    cooldowns: 5
};

// === MAIN RUN FUNCTION ===
const __legacyRun = async function ({ api, event, args, Users }) {
    const { threadId, type, data } = event;
    const senderID = data.uidFrom;

    if (!checkLimit(threadId, 'profile')) {
        return api.sendMessage("❌ Lệnh profile đã bị tắt trong nhóm.", threadId, type);
    }

    if (args[0] && args[0].toLowerCase() === "test") {
        const menuTest = `🎮 HNHANN STUDIO - TẠO MẪU PROFILE TEST 🎮\n\n1️⃣ Layout Vàng Supreme\n2️⃣ Layout Goku Special\n3️⃣ Layout Oscar\n4️⃣ Layout Nagi\n5️⃣ Layout Itachi\n6️⃣ Layout 06 (1 Súng)\n\n🔄 Reply tin nhắn này kèm số (1-6) để chọn layout.`;
        const info = await api.sendMessage(menuTest, threadId, type);
        const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
        if (replyMsgId) global.client.handleReply.set(replyMsgId, { name: REPLY_NAME, author: senderID, step: "test_layout" });
        return;
    }

    const userTurns = readJsonFile(FILES.USER_TURNS, {});
    const currentTurns = userTurns[senderID] || 0;

    if (currentTurns <= 0) {
        return api.sendMessage("❌ Bạn đã hết lượt sử dụng. Vui lòng nạp thêm để tiếp tục.", threadId, type);
    }

    const menu = `🎮 HNHANN STUDIO - THIẾT KẾ PROFILE FF 🎮\n💎 Số lượt hiện có: ${currentTurns} lượt\n\n1️⃣ Layout Vàng Supreme\n2️⃣ Layout Goku Special\n3️⃣ Layout Oscar\n4️⃣ Layout Nagi\n5️⃣ Layout Itachi\n6️⃣ Layout 06 (1 Súng)\n\n💰 Phí: 1 lượt / profile\n📌 Gõ 'profile test' để xem mẫu\n\n🔄 Reply tin nhắn này kèm số (1-6) để chọn layout.`;

    const info = await api.sendMessage(menu, threadId, type);
    const replyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
    if (replyMsgId) global.client.handleReply.set(replyMsgId, { name: REPLY_NAME, author: senderID, step: 1 });
};

// === HANDLE REPLY ===
const __legacyOnReply = async function (params) {
    const api = params?.api;
    const event = params?.event || {};
    const Users = params?.Users;
    const { threadId, type, data } = event;

    const quoteMsgId = String(
        event?.data?.quote?.globalMsgId ||
        event?.data?.quote?.cliMsgId ||
        event?.data?.quote?.msgId ||
        ""
    );
    if (!quoteMsgId || !global.client.handleReply.has(quoteMsgId)) return;

    const handleReply = global.client.handleReply.get(quoteMsgId);
    if (handleReply.name !== REPLY_NAME) return;

    const senderID = data?.uidFrom;
    const body = String(data?.content ?? "");
    if (senderID !== handleReply.author) return;

    await tryDeleteOwnMessage(api, threadId, type, { message: { msgId: handleReply.msgId, cliMsgId: quoteMsgId } });

    const s = handleReply.step;
    const d = handleReply.userData || {};

    const next = async (msg, nStep, uData) => {
        const info = await api.sendMessage(msg, threadId, type);
        const newReplyMsgId = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
        if (newReplyMsgId) {
            global.client.handleReply.set(newReplyMsgId, {
                name: REPLY_NAME,
                author: senderID,
                step: nStep,
                userData: { ...d, ...uData }
            });
        }
    };

    const gunsData = readJsonFile(FILES.GUN_DATA, []);
    const charsData = readJsonFile(FILES.CHAR_DATA, []);

    const getGunNames = () => gunsData.map(g => g.name);
    const getCharNames = () => charsData.map(c => c.name);

    switch (s) {
        case "test_layout": {
            const templatesTest = { "1": "vang", "2": "goku", "3": "oscar", "4": "nagi", "5": "itachi", "6": "layout06" };
            const selectedTemplate = templatesTest[body];
            if (!selectedTemplate) {
                return api.sendMessage("❌ Lựa chọn không hợp lệ. Vui lòng thử lại.", threadId, type);
            }

            if (gunsData.length < 2 || charsData.length < 4) {
                return api.sendMessage("❌ Dữ liệu hệ thống chưa đủ để test.", threadId, type);
            }

            const randomGuns = gunsData.sort(() => 0.5 - Math.random()).slice(0, 2).map(g => g.name);
            const randomChars = charsData.sort(() => 0.5 - Math.random()).slice(0, 4).map(c => c.name);
            const positionsTest = ["Tanker", "Bomber", "Sniper", "Support", "Rusher"];
            const randomPosition = positionsTest[Math.floor(Math.random() * positionsTest.length)];

            const testInput = {
                template: selectedTemplate,
                nickname: selectedTemplate === "layout06" ? "1769573310" : "Hồ Anh Nhân",
                team: selectedTemplate === "layout06" ? "GOW.PIGO" : "HN ESP",
                realName: "HNhann STUDIO",
                position: `${randomPosition}`,
                birthday: "13/07/2008",
                gunIds: selectedTemplate === "layout06" ? randomGuns[0] : randomGuns.join(','),
                skillIds: randomChars.join(','),
                studioText: selectedTemplate === "layout06" ? "SCRIM PIGO LIVE" : "HNHANN STUDIO"
            };

            const statusInfo = await api.sendMessage("⏳ Đang khởi tạo bản mẫu thử...\n✨ HNHANN STUDIO ✨", threadId, type);
            try {
                const buf = await renderSupremeProfile(testInput);
                const p = path.join(PATHS.TEMP, `hnhann_test_${Date.now()}.png`);
                fs.writeFileSync(p, buf);

                await api.sendMessage({
                    msg: `✨ HNHANN STUDIO ✨\n✅ Tạo bản mẫu thử thành công!\n🎨 Layout: ${selectedTemplate.toUpperCase()}`,
                    attachments: p
                }, threadId, type);
                try { fs.unlinkSync(p); } catch {}
                await tryDeleteOwnMessage(api, threadId, type, statusInfo);
            } catch (e) {
                api.sendMessage("❌ Lỗi hệ thống: " + e.message, threadId, type);
            }
            break;
        }

        case 1: {
            const templates = { "1": "vang", "2": "goku", "3": "oscar", "4": "nagi", "5": "itachi", "6": "layout06" };
            const pickedLayout = templates[body] || "vang";

            if (pickedLayout === "layout06") {
                await next("🆔 Nhập UID trong game của bạn\n📝 Ví dụ:\n1769573310", 2, { template: pickedLayout });
            } else {
                await next("👤 Nhập tên game của bạn\n📝 Ví dụ:\nHNE.HNhann", 2, { template: pickedLayout });
            }
            break;
        }
        case 2:
            if (d.template === "layout06") {
                await next("🛡️ Nhập tên Team/Quân đoàn (Góc trái trên)\n📝 Ví dụ:\nGOW.PIGO", 3, { nickname: body });
            } else {
                await next("🛡️ Nhập tên team của bạn\n📝 Ví dụ:\nHN ESP", 3, { nickname: body });
            }
            break;
        case 3:
            if (d.template === "layout06") {
                await next("🎂 Nhập ngày sinh của bạn\n⚠️ Định dạng: xx/xx/xxxx\n📝 Ví dụ: 19/12/2003", 5, { team: body, realName: "" });
            } else {
                await next("📛 Nhập tên thật của bạn\n📝 Ví dụ:\nHồ Anh Nhân", 4, { team: body });
            }
            break;
        case 4:
            await next("🎂 Nhập ngày sinh của bạn\n⚠️ Yêu cầu đúng định dạng: xx/xx/xxxx\n📝 Ví dụ: 13/07/2008", 5, { realName: body });
            break;
        case 5: {
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
            if (!dateRegex.test(body.trim())) {
                const info = await api.sendMessage("❌ Định dạng ngày sinh không hợp lệ.\n\n💡 Vui lòng nhập đúng định dạng xx/xx/xxxx (Ví dụ: 13/07/2008).\n\n🔄 Reply tin nhắn này để nhập lại:", threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 5, userData: d });
                return;
            }
            await next("⚔️ Nhập vị trí thi đấu\n📝 Ví dụ:\n- T (Tanker)\n- S (Support)\n- B (Bomber)\n- R (Rusher)\n- SN (Sniper)", 6, { birthday: body.trim() });
            break;
        }
        case 6: {
            const positionMap = {
                "t": "TANK", "tanker": "TANK",
                "s": "SUPPORT", "support": "SUPPORT",
                "b": "BOMBER", "bomber": "BOMBER",
                "r": "RUSHER", "rusher": "RUSHER",
                "sn": "SNIPER", "sniper": "SNIPER"
            };
            const posInput = body.trim().toLowerCase();
            const validPosition = positionMap[posInput];

            if (!validPosition) {
                const info = await api.sendMessage("❌ Vị trí thi đấu không hợp lệ.\n\n💡 Vui lòng nhập đúng định dạng:\n- T (hoặc Tanker)\n- S (hoặc Support)\n- B (hoặc Bomber)\n- R (hoặc Rusher)\n- SN (hoặc Sniper)\n\n🔄 Reply tin nhắn này để nhập lại:", threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 6, userData: d });
                return;
            }

            if (d.template === "layout06") {
                await next("✨ Nhập tên Kênh Stream (Góc giữa trên)\n📝 Ví dụ:\nSCRIM PIGO LIVE", 7, { position: validPosition });
            } else {
                await next("✨ Nhập trực tiếp tại đâu kênh nào\n📝 Ví dụ:hnhannreal", 7, { position: validPosition });
            }
            break;
        }
        case 7: {
            await next("🔫 Nhập khẩu súng thứ nhất\n📝 Ví dụ:\nM590", 8, { studioText: body.trim() });
            break;
        }
        case 8: {
            const checkGun1 = gunsData.find(x => x.name.toLowerCase().includes(body.trim().toLowerCase()));
            if (!checkGun1) {
                const suggests = getSuggestions(body.trim(), getGunNames());
                const info = await api.sendMessage(`❌ Tên súng không đúng.\n\n💡 Gợi ý:\n${suggests.join(" / ")}\n\n🔄 Reply tin nhắn này để nhập lại:`, threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 8, userData: d });
                return;
            }

            if (d.template === "layout06") {
                await next("🏃 Nhập kỹ năng nhân vật 1\n📝 Ví dụ:\nĐại Bàng", 10, { gun1: body.trim(), gun2: "" });
            } else {
                await next("🔫 Nhập khẩu súng thứ hai\n📝 Ví dụ:\nAC80", 9, { gun1: body.trim() });
            }
            break;
        }
        case 9: {
            const checkGun2 = gunsData.find(x => x.name.toLowerCase().includes(body.trim().toLowerCase()));
            if (!checkGun2) {
                const suggests = getSuggestions(body.trim(), getGunNames());
                const info = await api.sendMessage(`❌ Tên súng không đúng.\n\n💡 Gợi ý:\n${suggests.join(" / ")}\n\n🔄 Reply tin nhắn này để nhập lại:`, threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 9, userData: d });
                return;
            }
            await next("🏃 Nhập kỹ năng nhân vật 1\n📝 Ví dụ:\nAlok", 10, { gun2: body.trim() });
            break;
        }
        case 10: {
            const checkChar1 = charsData.find(x => x.name.toLowerCase().includes(body.trim().toLowerCase()));
            if (!checkChar1) {
                const suggests = getSuggestions(body.trim(), getCharNames());
                const info = await api.sendMessage(`❌ Tên nhân vật không đúng.\n\n💡 Gợi ý:\n${suggests.join(" / ")}\n\n🔄 Reply tin nhắn này để nhập lại:`, threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 10, userData: d });
                return;
            }
            await next("🏃 Nhập kỹ năng nhân vật 2\n📝 Ví dụ:\nKelly", 11, { skill1: body.trim() });
            break;
        }
        case 11: {
            const checkChar2 = charsData.find(x => x.name.toLowerCase().includes(body.trim().toLowerCase()));
            if (!checkChar2) {
                const suggests = getSuggestions(body.trim(), getCharNames());
                const info = await api.sendMessage(`❌ Tên nhân vật không đúng.\n\n💡 Gợi ý:\n${suggests.join(" / ")}\n\n🔄 Reply tin nhắn này để nhập lại:`, threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 11, userData: d });
                return;
            }
            await next("🏃 Nhập kỹ năng nhân vật 3\n📝 Ví dụ:\nHayato", 12, { skill2: body.trim() });
            break;
        }
        case 12: {
            const checkChar3 = charsData.find(x => x.name.toLowerCase().includes(body.trim().toLowerCase()));
            if (!checkChar3) {
                const suggests = getSuggestions(body.trim(), getCharNames());
                const info = await api.sendMessage(`❌ Tên nhân vật không đúng.\n\n💡 Gợi ý:\n${suggests.join(" / ")}\n\n🔄 Reply tin nhắn này để nhập lại:`, threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 12, userData: d });
                return;
            }
            await next("🏃 Nhập kỹ năng nhân vật 4\n📝 Ví dụ:\nMoco", 13, { skill3: body.trim() });
            break;
        }
        case 13: {
            const checkChar4 = charsData.find(x => x.name.toLowerCase().includes(body.trim().toLowerCase()));
            if (!checkChar4) {
                const suggests = getSuggestions(body.trim(), getCharNames());
                const info = await api.sendMessage(`❌ Tên nhân vật không đúng.\n\n💡 Gợi ý:\n${suggests.join(" / ")}\n\n🔄 Reply tin nhắn này để nhập lại:`, threadId, type);
                const rid = String(info?.message?.msgId || info?.message?.cliMsgId || info?.msgId || info?.cliMsgId || "");
                if (rid) global.client.handleReply.set(rid, { name: REPLY_NAME, author: senderID, step: 13, userData: d });
                return;
            }

            const updatedData = {
                ...d,
                gunIds: d.template === "layout06" ? `${d.gun1}` : `${d.gun1},${d.gun2}`,
                skillIds: `${d.skill1},${d.skill2},${d.skill3},${body.trim()}`
            };

            await processFinalRender(api, event, Users, updatedData, updatedData.studioText);
            break;
        }
    }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
