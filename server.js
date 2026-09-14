import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * server.js
 *
 * Dashboard Express tối giản, CHỈ ĐỌC. Không có terminal từ xa, không có
 * endpoint thực thi lệnh tùy ý, không sửa file source, không hiển thị
 * session/cookie/imei. Bind mặc định vào 127.0.0.1 — nếu muốn public,
 * xem README để thêm xác thực trước.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LISTEN_RETRY_MAX_MS = 15_000; // tổng thời gian tối đa để thử lại
const LISTEN_RETRY_INTERVAL_MS = 500; // khoảng cách giữa mỗi lần thử

function createServer(bot) {
  const app = express();

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      botName: bot.config.botName,
      uptimeMs: Date.now() - bot.config.startedAt,
    });
  });

  app.get("/api/stats", (req, res) => {
    try {
      const userCount = bot.db.query("SELECT COUNT(*) AS c FROM users")[0]?.c ?? 0;
      const groupCount = bot.db.query("SELECT COUNT(*) AS c FROM groups")[0]?.c ?? 0;
      res.json({
        botName: bot.config.botName,
        prefix: bot.config.botPrefix,
        uptimeMs: Date.now() - bot.config.startedAt,
        commandCount: bot.commands.size,
        userCount,
        groupCount,
      });
    } catch (err) {
      res.status(500).json({ error: "Không lấy được thống kê." });
    }
  });

  app.get("/api/commands", (req, res) => {
    const list = [...bot.commands.values()].map((c) => ({
      name: c.name,
      description: c.description,
      group: c.group,
      role: c.role,
      cooldown: c.cooldown,
      aliases: c.aliases,
    }));
    res.json({ commands: list });
  });

  return app;
}

/**
 * Bind port với cơ chế tự thử lại khi gặp EADDRINUSE.
 * Xảy ra khi tiến trình cũ (trước khi restart) chưa kịp giải phóng port hẳn.
 * Trả về Promise resolve khi bind thành công, reject nếu hết thời gian thử.
 */
function listenWithRetry(app, port, host, logger) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let server;

    const tryListen = () => {
      server = app.listen(port, host);

      server.once("listening", () => {
        logger.info(`[Dashboard] Đang chạy tại http://${host}:${port} (chỉ localhost).`);
        resolve(server);
      });

      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          const elapsed = Date.now() - startedAt;

          if (elapsed >= LISTEN_RETRY_MAX_MS) {
            logger.error(
              `[Dashboard] Port ${port} vẫn đang bị chiếm sau ${elapsed}ms, bỏ cuộc.`,
            );
            reject(err);
            return;
          }

          logger.warn(
            `[Dashboard] Port ${port} đang bận (có thể do tiến trình cũ chưa thoát hẳn), thử lại...`,
          );

          setTimeout(tryListen, LISTEN_RETRY_INTERVAL_MS);
          return;
        }

        // Lỗi khác EADDRINUSE thì báo lỗi ngay, không retry.
        reject(err);
      });
    };

    tryListen();
  });
}

async function startServer(bot, logger) {
  const app = createServer(bot);
  const server = await listenWithRetry(app, bot.config.port, "127.0.0.1", logger);
  return server;
}

export { createServer, startServer };