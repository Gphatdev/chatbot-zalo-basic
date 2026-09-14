import { spawn } from "node:child_process";

/**
 * Lệnh khởi động lại bot.
 * Tự spawn 1 tiến trình node mới chạy lại chính entry file (index.js),
 * rồi thoát tiến trình hiện tại. server.js đã tự retry khi gặp
 * EADDRINUSE nên không cần đoán delay ở đây nữa.
 */
async function run({ adapter, message, logger }) {
  const threadId = message.threadId;
  const threadType = message.type === 1 ? "group" : "user";

  await adapter.sendText({
    threadId,
    threadType,
    text: "🔄 Đang khởi động lại bot...\nVui lòng chờ trong giây lát.",
  });

  logger?.info?.("[Restart] Bot đang được khởi động lại bởi user.", {
    threadId,
    userId: message?.data?.uidFrom,
  });

  const child = spawn(process.argv[0], process.argv.slice(1), {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: false,
  });

  child.unref();

  process.exit(0);
}

export default {
  name: "rst",
  aliases: ["khoidonglai", "reboot"],
  description: "Khởi động lại bot",
  run,
};