/**
 * Core/LegacySystem.js
 *
 * Cơ chế "onReply" + "handleEvent" tương thích NKNP — song song với hệ thống
 * Handlers/* gốc của EMPHAT (không thay thế). Được gắn thêm (additive) vào
 * registerHandlers() trong Handlers/Core.js.
 *
 * - dispatchLegacyReply()  : tương đương core/handle/handleReply.js (NKNP)
 * - dispatchLegacyEvent()  : tương đương core/handle/handleEvent.js (NKNP)
 */

import { legacyReplyStore, legacyEventStore, Users, Threads } from "./LegacyBridge.js";

function cleanMentions(body, mentions = []) {
  if (!body) return "";
  if (!Array.isArray(mentions) || mentions.length === 0) return body.trim();
  const sorted = [...mentions].sort((a, b) => b.pos - a.pos);
  let cleaned = body;
  for (const m of sorted) {
    if (typeof m.pos !== "number" || typeof m.len !== "number") continue;
    cleaned = cleaned.slice(0, m.pos) + cleaned.slice(m.pos + m.len);
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function buildReplyData(event) {
  const d = event?.data || {};
  return {
    content: d.content,
    msgType: d.msgType,
    propertyExt: d.propertyExt,
    uidFrom: d.uidFrom,
    msgId: d.msgId,
    cliMsgId: d.cliMsgId,
    ts: d.ts,
    ttl: d.ttl,
  };
}

/** Tương đương handleReply(event, api) của NKNP. */
async function dispatchLegacyReply(event, api, logger) {
  try {
    if (!event?.data || !event.data.quote) return;

    event.data.content = cleanMentions(event.data.content || "", event.data.mentions || []);

    const quote = event.data.quote;
    const keys = [quote.globalMsgId, quote.cliMsgId, quote.msgId].filter(Boolean).map(String);
    if (!keys.length) return;

    let replyData = null;
    let replyKey = null;
    for (const key of keys) {
      if (legacyReplyStore.has(key)) {
        replyKey = key;
        replyData = legacyReplyStore.get(key);
        break;
      }
    }
    if (!replyData) return;

    const command = global.client?.commands?.get(replyData.name);
    if (!command) {
      legacyReplyStore.delete(replyKey);
      return;
    }
    if (replyData.author && String(replyData.author) !== String(event.data.uidFrom)) return;
    if (typeof command.onReply !== "function") return;

    await command.onReply({ api, event, Users, Threads, Reply: replyData });
  } catch (err) {
    logger?.error?.("[LegacySystem] Lỗi dispatchLegacyReply:", { message: err?.message });
  }
}

/** Tương đương handleEvent(eventType, eventData, api) của NKNP. */
function dispatchLegacyEvent(eventType, eventData, api, logger) {
  for (const [name, eventModule] of legacyEventStore) {
    const targetEvents = eventModule?.config?.event_type;
    if (!Array.isArray(targetEvents) || !targetEvents.includes(eventType)) continue;
    if (typeof eventModule.run !== "function") continue;

    const replyData = buildReplyData(eventData);
    Promise.resolve(
      eventModule.run({ api, event: eventData, eventType, Users, Threads, replyData }),
    ).catch((err) =>
      logger?.error?.(`[LegacySystem] Lỗi event di sản '${name}' (${eventType}):`, {
        message: err?.message,
      }),
    );
  }

  const commands = global.client?.commands;
  if (!commands) return;
  for (const [name, commandModule] of commands) {
    if (typeof commandModule.handleEvent !== "function") continue;
    const replyData = buildReplyData(eventData);
    Promise.resolve(
      commandModule.handleEvent({ api, event: eventData, eventType, Users, Threads, replyData }),
    ).catch((err) =>
      logger?.error?.(`[LegacySystem] Lỗi handleEvent của lệnh '${name}' (${eventType}):`, {
        message: err?.message,
      }),
    );
  }
}

/** Nạp 1 module event di sản (đã được adapt) vào registry. */
function registerLegacyEvent(eventModule) {
  if (!eventModule?.config?.name) return;
  legacyEventStore.set(eventModule.config.name, eventModule);
}

export { dispatchLegacyReply, dispatchLegacyEvent, registerLegacyEvent };
