/**
 * [PORT TỪ NKNP] autodown.js
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

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Reactions } = require("zca-js");
const { processVideo, processAudio } = require("../../Utils/LegacyUtils.cjs");



const patterns = [
    /tiktok\.com/, /douyin\.com/, /capcut\.com/, /threads\.net/, /instagram\.com/, /facebook\.com/, /espn\.com/,
    /pinterest\.com/, /pin\.it/, /imdb\.com/, /imgur\.com/, /ifunny\.co/, /izlesene\.com/, /reddit\.com/, /youtube\.com/,
    /youtu\.be/, /twitter\.com/, /x\.com/, /vimeo\.com/, /snapchat\.com/, /bilibili\.com/, /dailymotion\.com/,
    /sharechat\.com/, /likee\.video/, /linkedin\.com/, /tumblr\.com/, /hipi\.co\.in/, /telegram\.org/,
    /getstickerpack\.com/, /bitchute\.com/, /febspot\.com/, /9gag\.com/, /ok\.ru/, /rumble\.com/, /streamable\.com/,
    /ted\.com/, /sohu\.com/, /xvideos\.com/, /xnxx\.com/, /xiaohongshu\.com/, /ixigua\.com/, /weibo\.com/,
    /miaopai\.com/, /meipai\.com/, /xiaoying\.tv/, /nationalvideo\.com/, /yingke\.com/, /sina\.com\.cn/,
    /vk\.com/, /vk\.ru/, /soundcloud\.com/, /mixcloud\.com/, /spotify\.com/, /zingmp3\.vn/, /bandcamp\.com/
];

const PINTEREST_REGEX = /pinterest\.com|pin\.it/i;
// 🆕 TikTok tách riêng khỏi subhatde, dùng API satoru.click/api/tikdl.
// Chỉ khớp tiktok.com — KHÔNG gồm douyin.com (douyin vẫn đi qua subhatde).
const TIKTOK_REGEX = /tiktok\.com/i;
// 🆕 Facebook tách riêng khỏi subhatde, dùng API satoru.click/api/fbdl.
const FACEBOOK_REGEX = /facebook\.com|fb\.watch/i;

// ---------------------------------------------------------------------------
// 🆕 Nguồn tải CHÍNH cho các nền tảng còn lại (trừ TikTok, Pinterest):
// subhatde.id.vn/downall, theo cấu trúc data.result || data.data || data,
// result.medias (hoặc result.media / result.links), result.author (có thể
// là object {name}), result.cover/thumbnail/dynamic_cover.
// ---------------------------------------------------------------------------
function normalizeSubhatdeResponse(raw) {
    if (!raw) return null;
    const result = raw.result || raw.data || raw || {};

    const title = result.title || "";
    const author =
        typeof result.author === "object" && result.author
            ? result.author.name || "Không rõ"
            : result.author || "Không rõ";

    const rawMedias = result.medias || result.media || result.links || [];
    const medias = Array.isArray(rawMedias) ? rawMedias : [];
    const thumbnail = result.cover || result.thumbnail || result.dynamic_cover || null;

    if (!medias.length) {
        console.error("[autodown][subhatde] Không tìm thấy medias, RAW RESPONSE =", JSON.stringify(raw));
        return null;
    }

    return { unique_id: null, author, title, medias, thumbnail };
}

async function fetchSubhatde(url) {
    const res = await axios.get("https://subhatde.id.vn/downall", {
        params: { url },
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 25000,
    });

    if (res.status !== 200 || !res.data) {
        throw new Error(`subhatde trả về status ${res.status}`);
    }

    const normalized = normalizeSubhatdeResponse(res.data);
    if (!normalized) throw new Error("Không đọc được medias từ subhatde (xem log RAW RESPONSE để chỉnh field)");
    return normalized;
}

// ---------------------------------------------------------------------------
// 🆕 Pinterest dùng API RIÊNG (api.satoru.click/api/pindl) — POST + JSON
// body {url} thay vì GET query string.
//
// ⚠️ Response JSON thật của endpoint này CHƯA được xác nhận field chính xác.
// Hàm dưới đây đoán theo các tên field phổ biến (video/image/url/medias...).
// Nếu không tìm thấy media nào, nó sẽ tự in nguyên response ra console
// (`[autodown][pindl] RAW RESPONSE`) để chỉnh field cho khớp 100% với API thật.
// ---------------------------------------------------------------------------
function normalizePinterestResponse(raw) {
    if (!raw) return null;
    const d = raw.data || raw.result || raw;

    const title = d.title || d.caption || raw.title || null;
    const author = d.author || d.username || raw.author || null;

    const medias = [];

    const videoUrl =
        d.video || d.video_url || d.videoUrl ||
        (typeof d.url === "string" && /\.mp4(\?|$)/i.test(d.url) ? d.url : null);
    if (videoUrl) medias.push({ type: "video", quality: "default", url: videoUrl });

    const imageUrl =
        d.image || d.image_url || d.imageUrl || d.hd ||
        (typeof d.url === "string" && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(d.url) ? d.url : null);
    if (imageUrl) medias.push({ type: "image", quality: "default", url: imageUrl });

    if (Array.isArray(d.medias)) medias.push(...d.medias);
    if (Array.isArray(d.images)) {
        d.images.forEach(u => medias.push({ type: "image", quality: "default", url: typeof u === "string" ? u : u.url }));
    }

    if (!medias.length) {
        console.error("[autodown][pindl] Không đoán được field media, RAW RESPONSE =", JSON.stringify(raw));
        return null;
    }

    return { unique_id: d.id || null, author, title, medias };
}

// ---------------------------------------------------------------------------
// 🆕 TikTok dùng API RIÊNG (api.satoru.click/api/tikdl) — GET ?url=...
//
// Cấu trúc response thật (đã xác nhận từ mẫu server trả về):
// {
//   operator, timestamp, responseTime,
//   answer: {
//     author, profilePic, description, likes, comments,
//     downloadLink,        // link video (khi tìm thấy)
//     mp3DownloadLink       // link audio/nhạc nền (khi tìm thấy)
//   }
// }
// Khi KHÔNG tìm thấy, server trả chuỗi text kiểu "Không tìm thấy liên kết
// tải." / "Không tìm thấy liên kết tải MP3." thay vì null/rỗng — nên phải
// lọc theo nội dung chuỗi đó, không thể chỉ check falsy.
// ---------------------------------------------------------------------------
function isEmptyTikdlValue(v) {
    if (!v || typeof v !== "string") return true;
    return /không tìm thấy/i.test(v);
}

function normalizeTikdlResponse(raw) {
    if (!raw) return null;
    const a = raw.answer || raw.data || raw.result || raw;

    const title = !isEmptyTikdlValue(a.description) ? a.description : null;
    const author = !isEmptyTikdlValue(a.author) ? a.author : "Không rõ";
    const thumbnail = !isEmptyTikdlValue(a.profilePic) ? a.profilePic : null;

    const medias = [];

    if (!isEmptyTikdlValue(a.downloadLink)) {
        medias.push({ type: "video", quality: "default", url: a.downloadLink });
    }

    if (!isEmptyTikdlValue(a.mp3DownloadLink)) {
        medias.push({ type: "audio", quality: "default", url: a.mp3DownloadLink });
    }

    if (!medias.length) {
        console.error("[autodown][tikdl] Không tìm thấy link tải (video/mp3 đều rỗng), RAW RESPONSE =", JSON.stringify(raw));
        return null;
    }

    return { unique_id: null, author, title, medias, thumbnail };
}

async function fetchTikdl(url) {
    const res = await axios.get("https://api.satoru.click/api/tikdl", {
        params: { url },
        timeout: 20000,
    });

    if (res.status !== 200 || !res.data) {
        throw new Error(`tikdl trả về status ${res.status}`);
    }

    const normalized = normalizeTikdlResponse(res.data);
    if (!normalized) throw new Error("Không đọc được dữ liệu TikTok trả về (xem log RAW RESPONSE để chỉnh field)");
    return normalized;
}

async function fetchApiData(url) {
    if (TIKTOK_REGEX.test(url)) {
        return fetchTikdl(url);
    }

    if (PINTEREST_REGEX.test(url)) {
        const down = await axios.post(
            "https://api.satoru.click/api/pindl",
            { url },
            { headers: { "Content-Type": "application/json" }, timeout: 20000 }
        );
        const normalized = normalizePinterestResponse(down.data);
        if (!normalized) throw new Error("Không đọc được dữ liệu Pinterest trả về (xem log RAW RESPONSE để chỉnh field)");
        return normalized;
    }

    // Mọi nền tảng còn lại: subhatde.id.vn/downall
    return fetchSubhatde(url);
}

// ---------------------------------------------------------------------------
// 🔧 FIX: bản gốc lấy `event.data.content` (NGUYÊN CẢ CÂU) làm URL khi tin
// nhắn là loại "webchat" — nếu người dùng gõ kèm chữ khác quanh link (vd
// "xem cái này https://tiktok.com/abc nha") thì URL gửi cho API tải sẽ chứa
// luôn phần chữ thừa đó, khiến API tải không hiểu và luôn lỗi. Nay chỉ lấy
// ĐÚNG PHẦN LINK khớp bằng regex, không lấy cả câu.
// ---------------------------------------------------------------------------
function extractUrl(event) {
    const content = event?.data?.content;
    if (!content) return null;

    if (event.data.msgType === "chat.recommended" && content.action === "recommened.link" && content.href) {
        return String(content.href).trim();
    }

    if (event.data.msgType === "webchat" && typeof content === "string") {
        const m = content.match(/https?:\/\/[^\s]+/);
        if (!m) return null;
        return m[0].trim();
    }

    return null;
}

async function reactSafe(api, event, threadId, type, reaction) {
    try {
        await api.addReaction(reaction, {
            data: { msgId: event.data.msgId, cliMsgId: event.data.cliMsgId },
            threadId,
            type
        });
    } catch {}
}

async function safeUnlink(filePath) {
    if (!filePath) return;
    try {
        fs.unlinkSync(filePath);
    } catch {}
}

// ---------------------------------------------------------------------------
// 🆕 Diễn giải lỗi axios thành debug info ngắn gọn, dễ hiểu — để tin nhắn lỗi
// gửi trong nhóm tự nói rõ nguyên nhân, không cần vào console mới biết.
// ---------------------------------------------------------------------------
function formatApiError(err) {
    // Có response từ server nhưng status lỗi (4xx/5xx)
    if (err.response) {
        const status = err.response.status;
        let serverMsg = "";
        try {
            const d = err.response.data;
            if (typeof d === "string") serverMsg = d.slice(0, 200);
            else if (d && (d.message || d.error)) serverMsg = String(d.message || d.error).slice(0, 200);
        } catch {}

        let hint = "";
        if (status === 503) hint = "(server API đang quá tải/bảo trì, thử lại sau vài phút)";
        else if (status === 504 || status === 408) hint = "(server API phản hồi quá lâu, timeout)";
        else if (status === 429) hint = "(bị giới hạn tần suất request, thử lại sau)";
        else if (status === 404) hint = "(endpoint không tồn tại, kiểm tra lại đường dẫn API)";
        else if (status >= 400 && status < 500) hint = "(request gửi lên có thể sai định dạng/tham số)";
        else if (status >= 500) hint = "(lỗi phía server API, không phải lỗi từ bot)";

        return `» Debug: HTTP ${status} ${hint}${serverMsg ? `\n» Server trả về: ${serverMsg}` : ""}`;
    }

    // Request đã gửi đi nhưng không nhận được phản hồi (mất mạng / timeout / DNS)
    if (err.request) {
        if (err.code === "ECONNABORTED") return "» Debug: Request timeout (server API không phản hồi kịp)";
        if (err.code === "ENOTFOUND") return "» Debug: Không phân giải được domain API (kiểm tra DNS/đường dẫn)";
        if (err.code === "ECONNREFUSED") return "» Debug: Server API từ chối kết nối";
        return `» Debug: Không nhận được phản hồi từ server API (${err.code || err.message})`;
    }

    // Lỗi xảy ra trước khi request được gửi (code tự ném lỗi, JSON parse, v.v.)
    return `» Debug: ${err.message}`;
}





async function downloadMedia(mediaUrl, mediaType, refererUrl) {
    try {
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        let filename;
        if (mediaType === 'video') {
            filename = `video_${Date.now()}.mp4`;
        } else if (mediaType === 'image') {
            filename = `image_${Date.now()}.jpg`;
        } else if (mediaType === 'audio') {
            filename = `audio_${Date.now()}.mp3`;
        } else {
            throw new Error('mediaType không hợp lệ');
        }

        const filePath = path.join(tempDir, filename);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        // 🆕 Nhiều CDN (TikTok/Douyin...) yêu cầu đúng Referer mới cho tải,
        // nếu không sẽ trả 403. Thêm origin của link gốc nếu có.
        if (refererUrl) {
            try {
                headers['Referer'] = new URL(refererUrl).origin;
            } catch {}
        }

        const response = await axios.get(mediaUrl, {
            responseType: 'stream',
            timeout: 30000,
            headers
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                resolve(filePath);
            });
            writer.on('error', reject);
        });
    } catch (err) {
        console.error('Lỗi downloadMedia:', err.message);
        return null;
    }
}

const __legacyConfig = {
    name: "autodown",
    version: "2.0.5",
    role: 2,
    author: "ShinTHL09, NLam182", // Phát triển từ Module gốc của pcoder, Kenne400k
    description: "Tự động tải media từ hơn 40 nền tảng phổ biến (Tiktok, Youtube, Facebook, Instagram, Capcut, Reddit, Twitter, Soundcloud, Spotify, Zingmp3, Telegram, Vimeo, Bilibili, Pinterest, v.v...)",
    category: "Tiện ích",
    usage: "autodown help",
    cooldowns: 5
};
const __legacyRun = async function ({ api, event, args }) {
    const { threadId, type } = event;

    return api.sendMessage({
        msg: '🔍 AUTODOWN HELPER\n\n' +
            'Tự động tải xuống media từ các link được chia sẻ trong nhóm.\n\n' +
            '📌 Các nền tảng được hỗ trợ:\n' +
            'Tiktok, Douyin, Capcut, Threads, Instagram, Facebook, Espn, Pinterest (pin.it), IMDb, Imgur, Ifunny, Izlesene, Reddit, Youtube, Twitter/X, Vimeo, Snapchat, Bilibili, Dailymotion, Sharechat, Likee, Linkedin, Tumblr, Hipi, Telegram, Getstickerpack, Bitchute, Febspot, 9GAG, ok.ru, Rumble, Streamable, Ted, SohuTv, Xvideos, Xnxx, Xiaohongshu, Ixigua, Weibo, Miaopai, Meipai, Xiaoying, National Video, Yingke, Sina, VK, Soundcloud, Mixcloud, Spotify, Zingmp3, Bandcamp.\n\n' +
            '💡 Cách sử dụng: Chỉ cần gửi link http:// hoặc https:// vào nhóm, bot sẽ tự động tải nếu nền tảng được hỗ trợ.\n\n' +
            '🔰 Phản hồi bằng emoji:\n' +
            '👍 - Đang xử lý\n' +
            '❤️ - Tải thành công\n' +
            '😢 - Lỗi khi tải\n' +
            '😮 - Không tìm thấy media\n',
        ttl: 5000
    }, threadId, type);
};
const __legacyHandleEvent = async function ({ api, event }) {
    if (!event.data || !event.data.content) return;

    let url = extractUrl(event);
    if (!url) return;

    // Nếu link thiếu hẳn "http(s)://" (vd người dùng gõ "tiktok.com/abc"),
    // tự thêm https:// vào để API tải vẫn nhận được link hợp lệ.
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const matches = patterns.some(pattern => pattern.test(url));
    if (!matches) return;

    const { threadId, type } = event;

    await reactSafe(api, event, threadId, type, Reactions.LIKE);

    let apiData;
    try {
        apiData = await fetchApiData(url);
    } catch (err) {
        console.error("[autodown] Lỗi khi gọi API tải xuống:", err.message);
        await reactSafe(api, event, threadId, type, Reactions.NONE);
        await reactSafe(api, event, threadId, type, Reactions.CRY);
        return api.sendMessage({ msg: `❌ Lỗi khi tải xuống media\n${formatApiError(err)}`, ttl: 15000 }, threadId, type);
    }

    if (!apiData || !Array.isArray(apiData.medias) || apiData.medias.length === 0) {
        await reactSafe(api, event, threadId, type, Reactions.NONE);
        await reactSafe(api, event, threadId, type, Reactions.WOW);
        return api.sendMessage({ msg: "❓ Không tìm thấy media để tải xuống", ttl: 15000 }, threadId, type);
    }

    let videoToSend = null;
    let imagesToSend = [];
    let audioToSend = null;

    const videos = apiData.medias.filter(item => item && item.type === 'video' && item.url);
    if (videos.length > 0) {
        // Ưu tiên theo nhiều kiểu đặt tên quality khác nhau tuỳ API (zeidteam
        // dùng "hd_no_watermark"/"no_watermark", subhatde/tikdl có thể dùng
        // "720p", "default"...).
        videoToSend =
            videos.find(v => String(v.quality || "").toLowerCase().includes("no_watermark")) ||
            videos.find(v => String(v.quality || "").toLowerCase().includes("720p")) ||
            videos.find(v => String(v.quality || "").toLowerCase().includes("1080p")) ||
            videos.find(v => String(v.quality || "").toLowerCase().includes("hd")) ||
            videos[0];
    }

    // 🆕 subhatde dùng type "photo" thay vì "image" ở một số nơi -> nhận cả 2.
    const images = apiData.medias.filter(item => item && (item.type === 'image' || item.type === 'photo') && item.url);
    if (images.length > 0) {
        imagesToSend = images.slice(0, 5);
    }

    const audios = apiData.medias.filter(item => item && item.type === 'audio' && item.url);
    if (audios.length > 0) {
        audioToSend = audios[0];
    }

    let metaInfo = [];
    if (apiData.unique_id) metaInfo.push(`UID: ${apiData.unique_id}`);
    if (apiData.author) metaInfo.push(`Author: ${apiData.author}`);
    if (apiData.title) metaInfo.push(`Title: ${apiData.title}`);

    let messageBody = "🎦 AUTODOWN";
    if (metaInfo.length > 0) {
        messageBody += "\n" + metaInfo.join("\n");
    } else if (apiData.title) {
        messageBody += "\n" + apiData.title;
    }

    // -------------------------------------------------------------------
    // 1) VIDEO
    // 🔧 FIX: xoá file video tạm sau khi xử lý xong (finally), dù thành
    // công hay thất bại — bản gốc không bao giờ xoá, gây rò rỉ ổ đĩa.
    // 🔧 FIX: react cảm xúc tách khỏi return nhờ reactSafe() không throw,
    // nên return luôn chạy đúng, không còn rơi xuống dưới gây nhắn lộn.
    // -------------------------------------------------------------------
    if (videoToSend) {
        let videoPath = null;
        try {
            videoPath = await downloadMedia(videoToSend.url, 'video', url);
            if (!videoPath) throw new Error("downloadMedia trả về null (tải video thất bại)");

            const videoData = await processVideo(videoPath, threadId, type);

            await api.sendVideo({
                msg: messageBody,
                videoUrl: videoData.videoUrl,
                thumbnailUrl: videoData.thumbnailUrl,
                duration: videoData.metadata.duration,
                width: videoData.metadata.width,
                height: videoData.metadata.height,
                ttl: 300000
            }, threadId, type);

            await reactSafe(api, event, threadId, type, Reactions.NONE);
            await reactSafe(api, event, threadId, type, Reactions.HEART);
            return;
        } catch (err) {
            console.error("Lỗi xử lý video:", err.message);
            await reactSafe(api, event, threadId, type, Reactions.NONE);
            await reactSafe(api, event, threadId, type, Reactions.CRY);
            // Không return ở đây để vẫn thử fallback ảnh/audio nếu API có trả kèm.
        } finally {
            await safeUnlink(videoPath);
        }
    }

    // -------------------------------------------------------------------
    // 2) ẢNH (kèm audio nếu có)
    // 🔧 FIX: return giờ nằm NGOÀI phần react (không bị bug "kẹt" như bản
    // gốc). Audio kèm ảnh được tách try/catch RIÊNG, lỗi audio không còn
    // làm sai lệch phản hồi của phần ảnh đã gửi thành công. File ảnh + audio
    // tạm đều được xoá đầy đủ.
    // -------------------------------------------------------------------
    if (imagesToSend.length > 0) {
        let localImages = [];
        try {
            for (const image of imagesToSend) {
                const imagePath = await downloadMedia(image.url, 'image', url);
                if (imagePath) localImages.push(imagePath);
            }
            if (!localImages.length) throw new Error("Không tải được ảnh nào");

            await api.sendMessage({
                msg: messageBody,
                attachments: localImages,
                ttl: 300000
            }, threadId, type);

            // Audio đính kèm (nếu API có trả) — lỗi ở bước này KHÔNG được
            // làm mất kết quả ảnh đã gửi thành công ở trên.
            if (audioToSend) {
                let voicePath = null;
                try {
                    voicePath = await downloadMedia(audioToSend.url, 'audio', url);
                    if (voicePath) {
                        const voiceUrl = await processAudio(voicePath, threadId, type);
                        await api.sendVoice({ voiceUrl, ttl: 300000 }, threadId, type);
                    }
                } catch (audioErr) {
                    console.error("Lỗi xử lý audio kèm ảnh (không ảnh hưởng ảnh đã gửi):", audioErr.message);
                } finally {
                    await safeUnlink(voicePath);
                }
            }

            await reactSafe(api, event, threadId, type, Reactions.NONE);
            await reactSafe(api, event, threadId, type, Reactions.HEART);
            return;
        } catch (err) {
            console.error("Lỗi xử lý hình ảnh:", err.message);
            await reactSafe(api, event, threadId, type, Reactions.NONE);
            await reactSafe(api, event, threadId, type, Reactions.CRY);
            return;
        } finally {
            for (const f of localImages) await safeUnlink(f);
        }
    }

    // -------------------------------------------------------------------
    // 3) AUDIO ĐƠN (không có video/ảnh)
    // 🔧 FIX: attachments phải là MẢNG [thumbnailPath], bản gốc truyền
    // thẳng string là sai định dạng so với mọi chỗ khác trong code.
    // 🔧 FIX: chỉ tải thumbnail khi apiData.thumbnail thực sự tồn tại,
    // bản gốc gọi downloadMedia(undefined,...) khi API không trả thumbnail.
    // 🔧 FIX: xoá voicePath sau khi dùng xong (bản gốc không xoá).
    // -------------------------------------------------------------------
    if (audioToSend) {
        let voicePath = null;
        let thumbnailPath = null;
        try {
            voicePath = await downloadMedia(audioToSend.url, 'audio', url);
            if (!voicePath) throw new Error("downloadMedia trả về null (tải audio thất bại)");

            const voiceUrl = await processAudio(voicePath, threadId, type);

            if (apiData.thumbnail) {
                thumbnailPath = await downloadMedia(apiData.thumbnail, 'image', url);
            }

            await api.sendMessage({
                msg: `${messageBody}\n\n🎵 Audio: `,
                attachments: thumbnailPath ? [thumbnailPath] : undefined,
                ttl: 300000
            }, threadId, type);
            await api.sendVoice({ voiceUrl, ttl: 300000 }, threadId, type);

            await reactSafe(api, event, threadId, type, Reactions.NONE);
            await reactSafe(api, event, threadId, type, Reactions.HEART);
            return;
        } catch (err) {
            console.error("Lỗi xử lý audio:", err.message);
            await reactSafe(api, event, threadId, type, Reactions.NONE);
            await reactSafe(api, event, threadId, type, Reactions.CRY);
        } finally {
            await safeUnlink(voicePath);
            await safeUnlink(thumbnailPath);
        }
    }

    return api.sendMessage({ msg: "📭 Không thể tải xuống media" }, threadId, type);
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, __legacyHandleEvent);
