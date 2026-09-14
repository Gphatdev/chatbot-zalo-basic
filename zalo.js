import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { config, describeConfigSafe } from "./App/Config.js";
import { verifyLicense } from "./App/License.js";
import { createDatabase } from "./App/Database.js";
import { loginWithSavedSessionOrQR } from "./App/Session.js";
import { createZcaAdapter } from "./App/ZcaAdapter.js";
import { createBotInstance } from "./App/BotInstance.js";
import { loadCommands } from "./Core/CommandLoader.js";
import { createCommandRouter } from "./Core/CommandRouter.js";
import { registerHandlers } from "./Handlers/Core.js";
import { createLogger } from "./Utils/Logger.js";
import { startServer } from "./server.js";
import { initLegacyGlobals, syncShadowCommandRegistry } from "./Core/LegacyBridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHUTDOWN_TIMEOUT_MS = 12_000;
const MAX_RECONNECT_ATTEMPTS = 12;
const BASE_RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

/**
 * Tự động cài package còn thiếu + tối ưu tốc độ cài đặt
 */
function ensureDependencies(logger) {
    const rootDir = process.cwd();
    const packageJsonPath = path.join(rootDir, "package.json");
    const nodeModulesPath = path.join(rootDir, "node_modules");
    const lockPath = path.join(rootDir, "package-lock.json");

    if (!fs.existsSync(packageJsonPath)) {
        logger?.warn?.("[NKNP V3] Không tìm thấy package.json → bỏ qua auto-install");
        return;
    }

    // Chỉ cài khi thật sự thiếu node_modules
    if (fs.existsSync(nodeModulesPath)) {
        logger?.info?.("[NKNP V3] ✓ Dependencies đã sẵn sàng");
        return;
    }

    logger?.info?.("[NKNP V3] Phát hiện thiếu node_modules → đang cài đặt package (tối ưu tốc độ)...");

    // Registry siêu nhanh cho VN / Châu Á
    const FAST_REGISTRY = "https://registry.npmmirror.com";

    try {
        // Dùng npm ci nếu có lock file (nhanh + chuẩn hơn nhiều)
        const hasLock = fs.existsSync(lockPath);
        const cmd = hasLock
            ? `npm ci --prefer-offline --no-audit --no-fund --registry=${FAST_REGISTRY}`
            : `npm install --prefer-offline --no-audit --no-fund --registry=${FAST_REGISTRY}`;

        execSync(cmd, {
            stdio: "inherit",
            cwd: rootDir,
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || "production",
                // Tăng concurrency tải package
                npm_config_fetch_retries: "2",
                npm_config_fetch_retry_mintimeout: "10000",
                npm_config_fetch_retry_maxtimeout: "60000",
                npm_config_maxsockets: "50",          // tải song song nhiều hơn
                npm_config_network_concurrency: "16",
            },
        });

        logger?.info?.("[NKNP V3] ✓ Đã cài đặt xong tất cả package (tối ưu)");
    } catch (err) {
        logger?.error?.("[NKNP V3] ✗ Lỗi khi tự cài package", {
            message: err?.message ?? String(err),
        });

        // Fallback: thử lại 1 lần với registry gốc nếu mirror lỗi
        try {
            logger?.warn?.("[NKNP V3] Thử lại với registry mặc định...");
            execSync("npm install --prefer-offline --no-audit --no-fund", {
                stdio: "inherit",
                cwd: rootDir,
            });
            logger?.info?.("[NKNP V3] ✓ Cài thành công bằng registry mặc định");
        } catch (err2) {
            logger?.error?.("[NKNP V3] ✗ Vẫn lỗi sau khi fallback", {
                message: err2?.message ?? String(err2),
            });
        }
    }
}

async function main() {
    const logger = createLogger(config.logLevel);
    await logger.banner(config.studioName || "NKNP STUDIO", "ZALO BOT • HỆ THỐNG THỜI GIAN THỰC");
    logger.infoBox({
        title: `${config.botName} — v${config.legacyVersion}`,
        rows: [
            ["Studio", config.studioName || "NKNP STUDIO"],
            ["Prefix", config.botPrefix],
            ["Admin", config.legacyAdminBot.length ? config.legacyAdminBot.join(", ") : "(chưa đặt)"],
            ["Support", config.legacySupportBot.length ? config.legacySupportBot.join(", ") : "(chưa đặt)"],
            ["Inbox riêng", config.legacyAllowPrivateCommand ? "Cho phép" : "Chặn"],
            ["Cổng dashboard", String(config.port)],
        ],
    });
    logger.info("[NKNP V3] Đang khởi động hệ thống...", describeConfigSafe(config));

    // ========== 0a. Xác thực API Token / API License (BẮT BUỘC) ==========
    // Không hợp lệ → process.exit(1) bên trong verifyLicense(), các bước
    // phía dưới (cài dependency, DB, đăng nhập Zalo...) sẽ không chạy.
    await verifyLicense(config, logger);

    // ========== 0b. Auto install package thiếu (đã tối ưu tốc độ) ==========
    ensureDependencies(logger);

    // ========== 1. Database ==========
    let db;
    try {
        db = await createDatabase(config.dbPath, logger);
        logger.info("[NKNP V3] ✓ Cơ sở dữ liệu sẵn sàng");
    } catch (err) {
        logger.error("[NKNP V3] ✗ Không thể khởi tạo database", {
            message: err?.message ?? String(err),
            stack: err?.stack,
        });
        process.exit(1);
    }

    // ========== 2. Login + Auto Reconnect mạnh ==========
    let api = null;
    let reconnectAttempts = 0;

    const loginWithRetry = async () => {
        while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const attempt = reconnectAttempts + 1;
            const delayMs = Math.min(
                BASE_RECONNECT_DELAY_MS * Math.pow(1.8, reconnectAttempts),
                MAX_RECONNECT_DELAY_MS
            );

            try {
                logger.info(`[NKNP V3] Đang kết nối mạng (lần ${attempt}/${MAX_RECONNECT_ATTEMPTS})...`);
                api = await loginWithSavedSessionOrQR({
                    sessionPath: config.sessionPath,
                    qrPath: config.qrPath,
                    logger,
                });
                logger.info("[NKNP V3] ✓ Đăng nhập thành công");
                reconnectAttempts = 0;
                return api;
            } catch (err) {
                reconnectAttempts++;
                const isNetworkError =
                    err?.message?.toLowerCase().includes("network") ||
                    err?.message?.toLowerCase().includes("timeout") ||
                    err?.message?.toLowerCase().includes("econn") ||
                    err?.code === "ENOTFOUND" ||
                    err?.code === "ETIMEDOUT" ||
                    err?.code === "ECONNRESET";

                logger.error(`[NKNP V3] ✗ Lỗi kết nối (lần ${attempt})`, {
                    message: err?.message ?? String(err),
                    code: err?.code,
                    isNetworkError,
                    nextRetryIn: `${Math.round(delayMs / 1000)}s`,
                });

                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    logger.error("[NKNP V3] ✗ Đã vượt quá số lần thử kết nối tối đa. Thoát.");
                    process.exit(1);
                }

                logger.warn(`[NKNP V3] Đợi ${Math.round(delayMs / 1000)}s rồi thử lại...`);
                await delay(delayMs);
            }
        }
    };

    await loginWithRetry();

    // ========== 3. Adapter ==========
    const adapter = createZcaAdapter(api, logger);
    const ownId = adapter.getOwnId();
    logger.info("[NKNP V3] ✓ UID hiện tại:", { uid: ownId });

    if (!config.ownerZaloId) {
        logger.warn(
            `[NKNP V3] OWNER_ZALO_ID chưa được đặt trong .env. ` +
            `UID của bạn là "${ownId}". ` +
            `Hãy dừng bot (Ctrl+C), điền OWNER_ZALO_ID rồi chạy lại để có full quyền owner (role 2).`
        );
        config.ownerZaloId = ownId;
    }

    // ========== 4. Bot instance ==========
    const bot = createBotInstance({ config, db, adapter, logger });
    global.__NKNP_BOT__ = bot; // dùng bởi Core/LegacyReload.cjs (lệnh !cmd reload)
    logger.info("[NKNP V3] ✓ Bot instance đã tạo");

    // ========== 4b. [NKNP V3] Lớp cầu nối tương thích NKNP ==========
    // Dựng global.config/users/api/client/data để ~44 lệnh port từ NKNP
    // chạy được nguyên vẹn logic gốc (xem Core/LegacyBridge.js).
    initLegacyGlobals({ config, adapter, logger });

    // ========== 5. Load commands ==========
    try {
        const commandsDir = path.join(__dirname, "Core", "Commands");
        await loadCommands(commandsDir, bot, logger);
        syncShadowCommandRegistry(bot); // đồng bộ global.client.commands sau khi nạp xong
        logger.info("[NKNP V3] ✓ Commands đã được tải", {
            total: bot.commands.size,
        });

        // Gọi onLoad() của các lệnh di sản (NKNP) đã khai báo, nếu có (vd
        // autosend.js/taixiu.js/thuebot.js gốc dùng để tự khởi động vòng lặp nền).
        for (const [, cmd] of bot.commands.entries()) {
            if (typeof cmd.__legacyOnLoad === "function") {
                await cmd.__legacyOnLoad().catch((err) =>
                    logger.warn(`[NKNP V3] ⚠ Lỗi onLoad() của lệnh '${cmd.name}'`, {
                        message: err?.message,
                    }),
                );
            }
        }
    } catch (err) {
        logger.error("[NKNP V3] ✗ Lỗi khi tải commands", {
            message: err?.message ?? String(err),
            stack: err?.stack,
        });
        process.exit(1);
    }

    // ========== 6. Command router ==========
    const router = createCommandRouter(bot);
    logger.info("[NKNP V3] ✓ Command router sẵn sàng");

    // ========== 7. Handlers ==========
    try {
        registerHandlers({ adapter, router, db, logger });
        logger.info("[NKNP V3] ✓ Handlers đã được đăng ký");
    } catch (err) {
        logger.error("[NKNP V3] ✗ Lỗi khi đăng ký handlers", {
            message: err?.message ?? String(err),
            stack: err?.stack,
        });
        process.exit(1);
    }

    // ========== 8. Dashboard ==========
    let httpServer;
    try {
        httpServer = await startServer(bot, logger);
        logger.info("[NKNP V3] ✓ Dashboard đã khởi động");
    } catch (err) {
        logger.error("[NKNP V3] ✗ Không thể khởi động dashboard", {
            message: err?.message ?? String(err),
        });
    }

    logger.info(`══════════════════════════════════════`);
    logger.info(` ${config.botName} đã sẵn sàng!`);
    logger.info(`══════════════════════════════════════`);

    // ========== Graceful Shutdown ==========
    let shuttingDown = false;

    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`[NKNP V3] Nhận tín hiệu ${signal} → đang tắt bot an toàn...`);

        const forceExitTimer = setTimeout(() => {
            logger.warn("[NKNP V3] Hết thời gian chờ → thoát cưỡng bức");
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);

        if (typeof forceExitTimer.unref === "function") forceExitTimer.unref();

        if (httpServer) {
            try {
                await new Promise((resolve) => httpServer.close(resolve));
                logger.info("[NKNP V3] ✓ Dashboard đã đóng");
            } catch (err) {
                logger.error("[NKNP V3] Lỗi đóng dashboard", {
                    message: err?.message ?? String(err),
                });
            }
        }

        try {
            adapter.stopListener();
            logger.info("[NKNP V3] ✓ Listener đã dừng");
        } catch (err) {
            if (err?.code !== "FEATURE_UNAVAILABLE") {
                logger.error("[NKNP V3] Lỗi dừng listener", {
                    message: err?.message ?? String(err),
                });
            }
        }

        try {
            db.flush();
            logger.info("[NKNP V3] ✓ Database đã flush");
        } catch (err) {
            logger.error("[NKNP V3] Lỗi flush database", {
                message: err?.message ?? String(err),
            });
        }

        clearTimeout(forceExitTimer);
        logger.info("[NKNP V3] ✓ Đã tắt an toàn. Tạm biệt!");
        process.exit(0);
    }

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));

    process.on("uncaughtException", (err) => {
        logger.error("[NKNP V3] UNCAUGHT EXCEPTION", {
            message: err?.message ?? String(err),
            stack: err?.stack,
        });
        process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
        logger.error("[NKNP V3] UNHANDLED REJECTION", {
            reason: reason?.message ?? String(reason),
            stack: reason?.stack,
        });
        process.exit(1);
    });
}

main().catch((err) => {
    console.error("[NKNP V3] Lỗi nghiêm trọng khi khởi động:", err?.message ?? err);
    process.exit(1);
});