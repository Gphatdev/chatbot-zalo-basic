import axios from "axios";

/**
 * App/License.js
 *
 * Xác thực API Token + API License với server trước khi cho phép bot chạy.
 * Không có (hoặc sai) token/license → bot dừng ngay, không đăng nhập Zalo,
 * không load command.
 *
 * ⚠️ LƯU Ý VỀ FORMAT API:
 * Endpoint hiện trả lỗi mẫu dạng { ok, code, message } (xác nhận qua lỗi
 * "method_not_allowed" khi gọi GET), nên hàm dưới đây giả định response
 * THÀNH CÔNG cũng có dạng { ok: true, ... }. Tên field gửi lên (`token`,
 * `license`) là giả định hợp lý — NẾU API thực tế của bạn dùng tên khác
 * (vd: apiToken/apiLicense, key/license_key...), chỉ cần sửa lại đúng 2 dòng
 * trong phần "body" bên dưới, không cần sửa gì khác trong file này.
 */

const VERIFY_URL = "https://botnknpvip.shop/api-verify";
const VERIFY_TIMEOUT_MS = 15_000;

async function verifyLicense(config, logger) {
    const { apiToken, apiLicense } = config;

    if (!apiToken || !apiLicense) {
        logger.error(
            "[License] ✗ Thiếu API_TOKEN hoặc API_LICENSE trong file .env. " +
            "Bot sẽ không khởi động cho tới khi được điền đầy đủ.",
        );
        process.exit(1);
    }

    logger.info("[License] Đang xác thực API Token / License...");

    let response;
    try {
        response = await axios.post(
            VERIFY_URL,
            {
                // ⚠️ Sửa 2 tên field này nếu API thực tế yêu cầu tên khác.
                token: apiToken,
                license: apiLicense,
            },
            {
                headers: { "Content-Type": "application/json" },
                timeout: VERIFY_TIMEOUT_MS,
                validateStatus: () => true, // tự xử lý mọi status code bên dưới
            },
        );
    } catch (err) {
        logger.error("[License] ✗ Không thể kết nối tới server xác thực.", {
            message: err?.message ?? String(err),
        });
        process.exit(1);
    }

    const data = response.data;
    const ok = data && data.ok === true;

    if (!ok) {
        const message = data?.message || `Xác thực thất bại (HTTP ${response.status}).`;
        const code = data?.code ? ` [${data.code}]` : "";
        logger.error(`[License] ✗ ${message}${code}`);
        logger.error("[License] Bot dừng lại vì API Token / License không hợp lệ.");
        process.exit(1);
    }

    logger.info("[License] ✓ Xác thực thành công. Bot được phép chạy.", {
        // In thêm thông tin server trả về (nếu có) để tiện theo dõi, không lộ token/license.
        expiresAt: data?.expiresAt ?? data?.expires_at ?? undefined,
        plan: data?.plan ?? undefined,
    });

    return data;
}

export { verifyLicense };
