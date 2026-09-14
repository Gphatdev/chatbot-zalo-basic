/**
 * [PORT TỪ NKNP] test.js
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
    name: "testreply",
    version: "1.0.0",
    role: 0,
    cooldowns: 5,
    description: "Test Handle Reply"
};
const __legacyRun = async ({ api, event }) => {

    const info = await api.sendMessage({
        msg: "💬 Hãy reply tin nhắn này."
    }, event.threadId, event.type);

    global.client.handleReply.set(
        String(info.message.msgId),
        {
            name: __legacyConfig.name,
            author: event.data.uidFrom
        }
    );

};
const __legacyOnReply = async ({ api, event, Reply }) => {

    if (Reply.author != event.data.uidFrom)
        return;

    await api.sendMessage({
        msg: "Bạn vừa nhập:\n" + event.data.content
    }, event.threadId, event.type);

    global.client.handleReply.delete(
        String(event.data.quote.globalMsgId)
    );
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, __legacyOnReply, undefined);
