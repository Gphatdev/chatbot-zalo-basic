/**
 * [PORT TỪ NKNP] stk.js
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

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const Fuse = require('fuse.js');

/* ========================================================
   CONFIG
======================================================== */
const TMP_DIR = path.join(__dirname, "data", "tmp_qr");

/* ========================================================
   TIỆN ÍCH
======================================================== */

/**
 * 🆕 Zalo: tải ảnh (QR, ảnh reply...) về file tạm rồi trả path để gửi
 * qua api.sendMessage({ attachments: [path] }, ...) — zca-js cần đường dẫn
 * file cục bộ chứ không nhận stream trực tiếp như FCA.
 */
async function downloadToTempFile(url, ext = ".jpg") {
    await fs.ensureDir(TMP_DIR);
    const filePath = path.join(TMP_DIR, `img_${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`);
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
    await fs.writeFile(filePath, res.data);
    return filePath;
}

function cleanupTempFile(filePath, delayMs = 60000) {
    setTimeout(() => {
        fs.remove(filePath).catch(() => {});
    }, delayMs);
}

/* ========================================================
   ADMIN BANK (mặc định nếu nhóm chưa set)
======================================================== */
const ADMIN_BANK = {
    accountNo  : "5127032006",
    accountName: "Lê Thành Nghĩa",
    acqId      : 970422,
    bankName   : "MBBANK",
    isManual   : false
};



const configPath = path.join(__dirname, 'cache', 'stk_config.json');

function readStkConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')); }
    catch (e) { return {}; }
}

function writeStkConfig(data) {
    fs.ensureDirSync(path.dirname(configPath));
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
}

async function getBankInfo(bankInput) {
    try {
        const res = await axios.get('https://api.vietqr.io/v2/banks');
        const fuse = new Fuse(res.data.data, { keys: ['name', 'shortName'], threshold: 0.3 });
        return fuse.search(bankInput.trim())[0]?.item || null;
    } catch (e) { return null; }
}

/**
 * 🆕 Zalo: kiểm tra quyền quản trị (QTV/trưởng nhóm hoặc bot admin toàn cục)
 * Theo đúng cấu trúc thật của zca-js (như trong anti.js):
 * api.getGroupInfo(threadId) → info.gridInfoMap[threadId].{creatorId, adminIds}
 */
async function getGroupAdminIds(api, threadId) {
    try {
        const info = await api.getGroupInfo(threadId);
        const groupInfo = info?.gridInfoMap?.[threadId];
        if (!groupInfo) return [];
        const ids = new Set();
        if (groupInfo.creatorId) ids.add(String(groupInfo.creatorId));
        if (Array.isArray(groupInfo.adminIds)) {
            groupInfo.adminIds.forEach(id => ids.add(String(id)));
        }
        return Array.from(ids);
    } catch (e) {
        console.error("[stk] Lỗi lấy thông tin nhóm:", e.message);
        return [];
    }
}

async function isThreadAdmin(api, threadId, senderID) {
    const groupAdmins = await getGroupAdminIds(api, threadId);
    const botAdmins = ((global.users && global.users.admin) || []).map(String);
    const allowed = [...groupAdmins, ...botAdmins];
    return allowed.includes(String(senderID));
}

/**
 * 🆕 Trích xuất URL ảnh từ tin nhắn được quote/reply (Zalo).
 * Cấu trúc quote của zca-js có thể khác nhau tuỳ phiên bản, nên thử
 * nhiều field phổ biến. Chỉnh lại nếu framework của bạn dùng tên khác.
 */
function extractQuotedImageUrl(quote) {
    if (!quote) return null;

    // 🆕 Zalo trả "attach" dưới dạng JSON STRING (không phải object/array)
    // VD: quote.attach = '{"title":"...","thumb":"https://...","href":"https://...","params":"..."}'
    let attach = quote.attach;
    if (typeof attach === "string") {
        try { attach = JSON.parse(attach); } catch { attach = null; }
    }

    const candidates = [
        attach?.href,
        attach?.hd,
        attach?.thumb,
        Array.isArray(quote?.attach) ? quote.attach[0]?.href : null,
        quote?.content?.href,
        quote?.content?.oriUrl,
        quote?.content?.normalUrl,
        quote?.content?.thumbUrl,
        quote?.content?.hdUrl,
        quote?.href,
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim();
    }
    return null;
}

function isQuotedImage(quote) {
    if (!quote) return false;
    const t = String(quote?.type ?? quote?.msgType ?? "").toLowerCase();
    if (t.includes("photo") || t.includes("image")) return true;
    // Fallback: nếu tìm được URL ảnh hợp lệ thì coi như là ảnh
    return !!extractQuotedImageUrl(quote);
}

async function displayStkInfo(api, event, bankInfo, args = []) {
    const { threadId, type } = event;

    if (bankInfo.isManual) {
        let imgPath = null;
        try {
            imgPath = await downloadToTempFile(bankInfo.imageUrl);
            // setqr có hasBankDetails → hiện ngân hàng/STK/chủ TK
            // setnotk dùng description
            const msg = bankInfo.hasBankDetails
                ? `🏦 Ngân hàng: ${bankInfo.bankName}\n🔢 STK: ${bankInfo.accountNo}\n👤 Chủ TK: ${bankInfo.accountName}`
                : (bankInfo.description ? `💳 ${bankInfo.description}\n\nQuét mã QR trong ảnh để thanh toán.` : "");
            const result = await api.sendMessage({ msg, attachments: [imgPath] }, threadId, type);
            cleanupTempFile(imgPath);
            return result;
        } catch (error) {
            if (imgPath) cleanupTempFile(imgPath, 0);
            return api.sendMessage({ msg: "❌ Không thể tải ảnh QR đã lưu." }, threadId, type);
        }
    }

    const amount  = !isNaN(args[0]) ? args[0] : "0";
    const addInfo = !isNaN(args[0]) ? args.slice(1).join(' ') : args.join(' ');
    const qrUrl   =
        `https://api.vietqr.io/image/${bankInfo.acqId}-${bankInfo.accountNo}-Ww2Bu5C.jpg` +
        `?accountName=${encodeURIComponent(bankInfo.accountName)}&amount=${amount}`;

    let qrPath = null;
    try {
        qrPath = await downloadToTempFile(qrUrl);
        const msg =
            `🏦 Ngân hàng: ${bankInfo.bankName}` +
            `\n🔢 STK: ${bankInfo.accountNo}` +
            `\n👤 Chủ TK: ${bankInfo.accountName}` +
            (amount !== "0" ? `\n💰 Số tiền: ${Number(amount).toLocaleString('vi-VN')} VND` : '') +
            (addInfo ? `\n📝 Nội dung: ${addInfo}` : '');
        const result = await api.sendMessage({ msg, attachments: [qrPath] }, threadId, type);
        cleanupTempFile(qrPath);
        return result;
    } catch (error) {
        if (qrPath) cleanupTempFile(qrPath, 0);
        return api.sendMessage({ msg: "❌ Lỗi khi tạo mã QR." }, threadId, type);
    }
}

/* ── Lưu setqr không có thông tin ngân hàng ── */
function finishSetqrNoBank(api, event, imageUrl, stkConfig) {
    const { threadId, type } = event;

    stkConfig[threadId] = { isManual: true, imageUrl, hasBankDetails: false };
    writeStkConfig(stkConfig);

    return api.sendMessage(
        { msg: `✅ Đã cài đặt QR tùy chỉnh thành công!\n\n✅ Lệnh STK / QR đã sẵn sàng sử dụng!` },
        threadId, type
    );
}

/* ── Lưu setnotk (QR kèm mô tả tùy chọn) ── */
function finishSetnotk(api, event, imageUrl, description, stkConfig) {
    const { threadId, type } = event;

    stkConfig[threadId] = {
        isManual: true,
        imageUrl,
        description: description || "Thông tin thanh toán của nhóm."
    };
    writeStkConfig(stkConfig);

    return api.sendMessage(
        { msg: `✅ Đã cài đặt QR tùy chỉnh thành công!\n\n✅ Lệnh STK / QR đã sẵn sàng sử dụng!` },
        threadId, type
    );
}

/* ── Lưu setqr có thông tin ngân hàng ── */
async function finishSetqrWithBank(api, event, imageUrl, bankInput, accountNo, accountName, stkConfig) {
    const { threadId, type } = event;

    const bank = await getBankInfo(bankInput);
    const bankNameToShow = bank ? bank.shortName : bankInput.toUpperCase();

    stkConfig[threadId] = {
        isManual      : true,
        imageUrl,
        hasBankDetails: true,
        bankName      : bankNameToShow,
        accountNo,
        accountName   : accountName.toUpperCase()
    };
    writeStkConfig(stkConfig);

    return api.sendMessage(
        {
            msg:
                `✅ Đã cài đặt QR tùy chỉnh kèm thông tin ngân hàng!\n` +
                `🏦 Ngân hàng: ${bankNameToShow}\n` +
                `🔢 STK: ${accountNo}\n` +
                `👤 Chủ TK: ${accountName.toUpperCase()}\n\n` +
                `✅ Lệnh STK / QR đã sẵn sàng sử dụng!`
        },
        threadId, type
    );
}

/* ========================================================
   RUN
======================================================== */


/* ========================================================
   HANDLE EVENT
   - Xử lý từ khóa tự động (stk, qr, ...)
   (Flow hỏi-đáp setqr đã chuyển sang module.exports.onReply)
======================================================== */


/* ========================================================
   ON REPLY
   - Xử lý flow hỏi-đáp setqr (giống cơ chế onReply của key.js)
   - Core gọi: module.exports.onReply({ api, event, Reply })
======================================================== */

const __legacyConfig = {
    name           : "stk",
    version        : "6.0.0-zalo",
    role           : 0,
    author         : "Pcoder & Khang (Zalo port)",
    description    : "Hiển thị thông tin STK. QTV dùng lệnh .stk set/setqr/setnotk/reset. Tự động phản hồi khi có từ khóa.",
    category       : "Nhóm",
    usage          : "[set/setqr/setnotk/reset] | [số tiền] [nội dung]",
    cooldowns      : 3,
    dependencies   : { "axios": "", "fs-extra": "", "fuse.js": "" }
};
const __legacyRun = async ({ api, event, args }) => {
    const { threadId, type, data } = event;
    const senderID = data?.uidFrom;
    const command = args[0]?.toLowerCase();
    const prefix  = global.config?.PREFIX || "!";

    if (!fs.existsSync(configPath)) writeStkConfig({});
    const stkConfig = readStkConfig();

    /* ── Lệnh admin: set / setqr / setnotk / reset ── */
    if (["set", "setqr", "setnotk", "reset"].includes(command)) {
        const allowed = await isThreadAdmin(api, threadId, senderID);
        if (!allowed) {
            return api.sendMessage(
                { msg: "⚠️ Chỉ quản trị viên của nhóm mới có quyền dùng lệnh này." },
                threadId, type
            );
        }

        switch (command) {
            case 'set': {
                const [_, bankInput, accountNo, ...accountNameArr] = args;
                const accountName = accountNameArr.join(' ').toUpperCase();
                if (!bankInput || !accountNo || !accountName)
                    return api.sendMessage(
                        { msg: "⚠️ Sai cú pháp!\nVí dụ: .stk set mbbank 12345 NGUYEN VAN A" },
                        threadId, type
                    );
                const bank = await getBankInfo(bankInput);
                if (!bank)
                    return api.sendMessage(
                        { msg: `❌ Không tìm thấy ngân hàng "${bankInput}".` },
                        threadId, type
                    );

                stkConfig[threadId] = {
                    accountNo,
                    accountName,
                    acqId   : bank.bin,
                    bankName: bank.shortName,
                    isManual: false
                };
                writeStkConfig(stkConfig);

                return api.sendMessage(
                    {
                        msg:
                            `✅ Đã cài đặt STK cho nhóm!\n` +
                            `🏦 Ngân hàng: ${bank.shortName}\n` +
                            `🔢 STK: ${accountNo}\n` +
                            `👤 Chủ TK: ${accountName}\n\n` +
                            `✅ Lệnh STK / QR đã sẵn sàng sử dụng!`
                    },
                    threadId, type
                );
            }

            /* ── setqr: reply ảnh QR → hỏi đáp từng bước ── */
            case 'setqr': {
                const quote = data?.quote;
                if (!isQuotedImage(quote)) {
                    return api.sendMessage(
                        {
                            msg:
                                `⚠️ Bạn phải reply (quote) một ảnh chứa mã QR khi dùng lệnh này.\n\n` +
                                `📌 Cú pháp: Reply ảnh QR rồi gõ ${prefix}stk setqr`
                        },
                        threadId, type
                    );
                }

                const imageUrl = extractQuotedImageUrl(quote);
                if (!imageUrl) {
                    return api.sendMessage(
                        { msg: "⚠️ Không lấy được ảnh từ tin nhắn reply, vui lòng thử lại." },
                        threadId, type
                    );
                }

                const infoMsg = await api.sendMessage(
                    {
                        msg:
                            `📋 Bạn có muốn điền thêm thông tin ngân hàng vào QR này không?\n\n` +
                            `✅ Reply "có" → Bot hỏi từng thông tin\n` +
                            `❌ Reply "không" → Lưu ảnh QR, không kèm thông tin`
                    },
                    threadId, type
                );

                const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                global.client.handleReply.set(replyMsgId, {
                    name  : __legacyConfig.name,
                    step  : 1,
                    author: senderID,
                    imageUrl
                });
                return;
            }

            /* ── setnotk: reply ảnh QR → lưu ngay kèm mô tả tùy chọn ── */
            case 'setnotk': {
                const quote = data?.quote;
                if (!isQuotedImage(quote)) {
                    return api.sendMessage(
                        { msg: "⚠️ Bạn phải reply (quote) một ảnh chứa mã QR." },
                        threadId, type
                    );
                }

                const imageUrl = extractQuotedImageUrl(quote);
                if (!imageUrl) {
                    return api.sendMessage(
                        { msg: "⚠️ Không lấy được ảnh từ tin nhắn reply, vui lòng thử lại." },
                        threadId, type
                    );
                }

                const descriptionArg = args.slice(1).join(' ').trim();
                if (descriptionArg) {
                    return finishSetnotk(api, event, imageUrl, descriptionArg, stkConfig);
                }

                const infoMsg = await api.sendMessage(
                    {
                        msg:
                            `📝 Nhập mô tả cho QR này (VD: "Thanh toán tiền nhóm"):\n\n` +
                            `➡️ Reply "không" nếu không cần mô tả.`
                    },
                    threadId, type
                );
                const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                global.client.handleReply.set(replyMsgId, {
                    name  : __legacyConfig.name,
                    step  : "notk_desc",
                    author: senderID,
                    imageUrl
                });
                return;
            }

            case 'reset': {
                if (stkConfig[threadId]) {
                    delete stkConfig[threadId];
                    writeStkConfig(stkConfig);
                    return api.sendMessage({ msg: "✅ Đã xóa cài đặt STK của nhóm." }, threadId, type);
                }
                return api.sendMessage({ msg: "ℹ️ Nhóm này chưa cài đặt STK." }, threadId, type);
            }
        }
        return;
    }

    /* ── Lệnh thường: hiện QR ── */
    const bankInfoToShow = stkConfig[threadId];
    if (!bankInfoToShow)
        return api.sendMessage(
            {
                msg:
                    `❎ Nhóm chưa cài đặt STK.\n` +
                    `📲 QTV dùng: ${prefix}stk set <ngân hàng> <stk> <tên chủ TK>`
            },
            threadId, type
        );

    return displayStkInfo(api, event, bankInfoToShow, args);
};
const __legacyOnReply = async function (context) {
    const api = context.api;
    const event = context.event;
    const ReplyData = context.Reply;
    if (!ReplyData) return;

    const { threadId, type } = event;
    const senderID = String(event?.data?.uidFrom || event?.senderID || event?.uid || "");
    const rawContent = String(event?.data?.content || "").trim();
    const modName = __legacyConfig.name;

    if (ReplyData.name !== modName || senderID !== String(ReplyData.author)) return;

    const stkConfig = readStkConfig();

    try {
        switch (ReplyData.step) {

            /* ════ BƯỚC 1: có / không ════ */
            case 1: {
                const ans = rawContent.toLowerCase().replace(/[!.?]/g, "").trim();
                const firstWord = ans.split(/\s+/)[0];

                if (["có", "co", "yes", "y", "ok"].includes(firstWord) || ["có", "co", "yes", "y", "ok"].includes(ans)) {
                    const infoMsg = await api.sendMessage(
                        { msg: `👤 Bước 1/3 — Nhập tên chủ tài khoản:\n(VD: NGUYEN VAN A)` },
                        threadId, type
                    );
                    const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                    global.client.handleReply.set(replyMsgId, {
                        name  : modName,
                        step  : 2,
                        author: senderID,
                        imageUrl: ReplyData.imageUrl
                    });
                    return;
                }

                if (["không", "khong", "no", "n", "k"].includes(firstWord) || ["không", "khong", "no", "n", "k"].includes(ans)) {
                    return finishSetqrNoBank(api, event, ReplyData.imageUrl, stkConfig);
                }

                const infoMsg = await api.sendMessage(
                    { msg: `⚠️ Không hiểu câu trả lời. Vui lòng reply "có" hoặc "không".` },
                    threadId, type
                );
                const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                global.client.handleReply.set(replyMsgId, { ...ReplyData });
                return;
            }

            /* ════ BƯỚC 2: tên chủ tài khoản ════ */
            case 2: {
                if (!rawContent) {
                    const infoMsg = await api.sendMessage({ msg: `⚠️ Tên chủ tài khoản không được để trống!` }, threadId, type);
                    const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                    global.client.handleReply.set(replyMsgId, { ...ReplyData });
                    return;
                }

                const infoMsg = await api.sendMessage(
                    { msg: `🔢 Bước 2/3 — Nhập số tài khoản:\n(VD: 12345678)` },
                    threadId, type
                );
                const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                global.client.handleReply.set(replyMsgId, {
                    name  : modName,
                    step  : 3,
                    author: senderID,
                    imageUrl: ReplyData.imageUrl,
                    accountName: rawContent.toUpperCase()
                });
                return;
            }

            /* ════ BƯỚC 3: số tài khoản ════ */
            case 3: {
                if (!rawContent) {
                    const infoMsg = await api.sendMessage({ msg: `⚠️ Số tài khoản không được để trống!` }, threadId, type);
                    const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                    global.client.handleReply.set(replyMsgId, { ...ReplyData });
                    return;
                }

                const infoMsg = await api.sendMessage(
                    { msg: `🏦 Bước 3/3 — Nhập tên ngân hàng:\n(VD: mbbank, tpbank, vietcombank...)` },
                    threadId, type
                );
                const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                global.client.handleReply.set(replyMsgId, {
                    name  : modName,
                    step  : 4,
                    author: senderID,
                    imageUrl: ReplyData.imageUrl,
                    accountName: ReplyData.accountName,
                    accountNo: rawContent.trim()
                });
                return;
            }

            /* ════ BƯỚC 4: tên ngân hàng → hoàn tất ════ */
            case 4: {
                if (!rawContent) {
                    const infoMsg = await api.sendMessage({ msg: `⚠️ Tên ngân hàng không được để trống!` }, threadId, type);
                    const replyMsgId = String(infoMsg?.message?.msgId || infoMsg?.message?.cliMsgId || infoMsg?.data?.msgId || infoMsg?.msgId);
                    global.client.handleReply.set(replyMsgId, { ...ReplyData });
                    return;
                }

                return finishSetqrWithBank(
                    api, event, ReplyData.imageUrl, rawContent.trim(),
                    ReplyData.accountNo, ReplyData.accountName, stkConfig
                );
            }

            /* ════ SETNOTK: nhập mô tả ════ */
            case "notk_desc": {
                const ans = rawContent.toLowerCase().replace(/[!.?]/g, "").trim();
                const description = ["không", "khong", "no", "n", "k"].includes(ans) ? "" : rawContent;
                return finishSetnotk(api, event, ReplyData.imageUrl, description, stkConfig);
            }

            default:
                return;
        }
    } catch (error) {
        console.error("[stk] Lỗi trong onReply:", error);
        return api.sendMessage("❌ Lỗi kĩ thuật khi xử lý reply: " + error.message, threadId, type);
    }
};
const __legacyHandleEvent = async function({ api, event }) {
    const { threadId, data } = event;

    // Chỉ xử lý tin nhắn văn bản thường (bỏ qua sticker/ảnh/sự kiện hệ thống...)
    const bodyRaw = data?.content;
    if (typeof bodyRaw !== "string") return;
    const body = bodyRaw.trim();
    if (!body) return;

    /* ── Từ khóa tự động ── */
    const keywords     = ['stk', 'số tài khoản', 'qr', 'mã qr', 'mã'];
    const keywordRegex = new RegExp(`(?:^|\\s)(${keywords.join('|')})(?:$|\\s)`, 'i');
    if (!keywordRegex.test(body)) return;

    const stkConfig   = readStkConfig();
    const groupConfig = stkConfig[threadId];
    if (!groupConfig) return;

    return displayStkInfo(api, event, groupConfig);
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, __legacyHandleEvent);
