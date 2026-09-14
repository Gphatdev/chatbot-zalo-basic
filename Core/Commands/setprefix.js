/**
 * [PORT TỪ NKNP] setprefix.js
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


const __legacyConfig = {
    name: "setprefix",
    version: "1.0.0",
    role: 1,
    author: "ShinTHL09",
    description: "Đặt lại prefix của nhóm",
    category: "Nhóm",
    usage: "[prefix/reset]",
    cooldowns: 2,
};
const __legacyRun = async ({ api, event, args, Threads }) => {
    if (typeof args[0] === "undefined") return api.sendMessage(`⚠️ Vui lòng nhập prefix mới. Ví dụ: !setprefix $`, event.threadId, event.type);
    const prefix = args[0].trim();
    if (!prefix) return api.sendMessage(`⚠️ Prefix không được để trống. Ví dụ: !setprefix $`, event.threadId, event.type);
    if (prefix === "reset") {
        var data = (await Threads.getData(event.threadId)).data || {};
        data.prefix = global.config.prefix;
        await Threads.setData(event.threadId, data);
        return api.sendMessage(`☑️ Đã đưa prefix của nhóm về mặc định: ${global.config.prefix}`, event.threadId, event.type);
    } else {
        var data = (await Threads.getData(String(event.threadId))).data || {};
        data.prefix = prefix;
        await Threads.setData(event.threadId, data);
        return api.sendMessage(`☑️ Đã đổi prefix của nhóm thành: ${prefix}`, event.threadId, event.type);
    }
};
const __legacyHandleEvent = async function({ api, event, Threads }) {
    const { threadId, type } = event;
    try {
        const { prefix } = global.config;

        var threadSetting = (await Threads.getData(event.threadId)).data || {};

        let prefixThread = threadSetting.prefix || prefix;

        const lowerBody = event.data.content.toLowerCase();

        if (
            lowerBody === "prefix" ||
            lowerBody === "prefix bot là gì" ||
            lowerBody === "quên prefix r" ||
            lowerBody === "dùng sao"
        ) {
            api.sendMessage(
            { msg: `✏️ Prefix của nhóm: ${prefixThread}\n📎 Prefix hệ thống: ${prefix}`, ttl: 15000},
            threadId,
            type
            );
        }
    } catch (e) {
    }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, __legacyHandleEvent);
