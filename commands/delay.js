"use strict";

const { replyDelay } = require("../state");

module.exports = {
  name: "delay",
  aliases: ["تأخير", "antiban"],
  description: "تشغيل أو إيقاف تأخير الردود لحماية الحساب من الحظر.",
  usage: "delay [on|off] [ثواني]",
  adminOnly: true,
  category: "Admin",

  async execute({ api, event, args }) {
    const { threadID } = event;
    const sub = (args[0] || "").toLowerCase();

    // -delay → عرض الحالة الحالية
    if (!sub) {
      const status = replyDelay.enabled
        ? `✅ مُفعَّل — التأخير: ${replyDelay.ms / 1000} ثانية`
        : `❌ مُعطَّل`;
      return api.sendMessage(
        `⏱ حالة تأخير الردود:\n${status}\n\n` +
        `الاستخدام:\n` +
        `  -delay on → تشغيل (1.5 ثانية)\n` +
        `  -delay on 3 → تشغيل بتأخير 3 ثواني\n` +
        `  -delay off → إيقاف`,
        threadID
      );
    }

    if (sub === "on" || sub === "تشغيل") {
      const sec = parseFloat(args[1]);
      if (!isNaN(sec) && sec > 0 && sec <= 10) {
        replyDelay.ms = Math.round(sec * 1000);
      } else if (isNaN(sec) || args[1] === undefined) {
        replyDelay.ms = 1500; // افتراضي 1.5 ثانية
      } else {
        return api.sendMessage("❌ المدة يجب أن تكون بين 0.1 و 10 ثواني.", threadID);
      }
      replyDelay.enabled = true;
      return api.sendMessage(
        `✅ تأخير الردود مُفعَّل\n⏱ المدة: ${replyDelay.ms / 1000} ثانية\n\n🛡 البوت الآن يتأخر قبل كل رد لحماية الحساب.`,
        threadID
      );
    }

    if (sub === "off" || sub === "إيقاف") {
      replyDelay.enabled = false;
      return api.sendMessage(
        `❌ تأخير الردود مُعطَّل\n\n⚠️ تأكد أن الاستخدام معقول لتجنب الحظر.`,
        threadID
      );
    }

    // رقم مباشر → ضبط المدة فقط
    const sec = parseFloat(sub);
    if (!isNaN(sec) && sec > 0 && sec <= 10) {
      replyDelay.ms = Math.round(sec * 1000);
      return api.sendMessage(
        `⏱ تم ضبط مدة التأخير على ${replyDelay.ms / 1000} ثانية.\n` +
        `الحالة: ${replyDelay.enabled ? "✅ مُفعَّل" : "❌ مُعطَّل"}`,
        threadID
      );
    }

    return api.sendMessage(
      "❓ استخدام خاطئ.\nأمثلة:\n  -delay on\n  -delay on 2\n  -delay off\n  -delay 3",
      threadID
    );
  },
};
