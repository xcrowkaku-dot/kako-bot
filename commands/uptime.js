"use strict";

const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const fs     = require("fs");
const os     = require("os");
const path   = require("path");
const config = require("../config.json");

// Register font once at module load
try {
  GlobalFonts.registerFromPath(
    path.join(__dirname, "../assets/JetBrainsMono-Bold.ttf"),
    "JBMono"
  );
} catch {}

function pad(n) { return String(n).padStart(2, "0"); }

function f(size, bold = true) {
  return (bold ? "bold " : "") + size + "px JBMono, monospace";
}

function hline(ctx, y, x1 = 0, x2 = 720, color = "#21262d") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  ctx.restore();
}

function vline(ctx, x, y1, y2, color = "#21262d") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildCard(info) {
  const W = 720, H = 412;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // ── Canvas background ─────────────────────────────────────────────────────
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 1.5;
  rrect(ctx, 1, 1, W - 2, H - 2, 6);
  ctx.stroke();

  // ── HEADER (0–58) ─────────────────────────────────────────────────────────
  ctx.fillStyle = "#161b22";
  ctx.fillRect(1, 1, W - 2, 57);
  hline(ctx, 58, 1, W - 1);

  // Online dot
  ctx.fillStyle = "#3fb950";
  ctx.beginPath(); ctx.arc(26, 29, 6, 0, Math.PI * 2); ctx.fill();

  // Bot name
  ctx.fillStyle = "#c9d1d9";
  ctx.font = f(17);
  ctx.textAlign = "left";
  ctx.fillText(info.botName.toUpperCase(), 44, 36);

  // ONLINE pill
  const pill = "ONLINE";
  ctx.font = f(10, false);
  const pw = ctx.measureText(pill).width + 18;
  const px = W / 2 - pw / 2;
  ctx.fillStyle = "#0d2313";
  rrect(ctx, px, 17, pw, 22, 4); ctx.fill();
  ctx.strokeStyle = "#2ea04326";
  ctx.lineWidth = 1;
  rrect(ctx, px, 17, pw, 22, 4); ctx.stroke();
  ctx.fillStyle = "#3fb950";
  ctx.textAlign = "center";
  ctx.fillText(pill, W / 2, 32);

  // Version
  ctx.fillStyle = "#6e7681";
  ctx.font = f(12, false);
  ctx.textAlign = "right";
  ctx.fillText("v" + info.version, W - 18, 35);

  // ── UPTIME ROW (58–148) ───────────────────────────────────────────────────
  ctx.fillStyle = "#080d12";
  ctx.fillRect(1, 59, W - 2, 88);
  hline(ctx, 147, 1, W - 1);

  // "UPTIME" micro-label
  ctx.fillStyle = "#484f58";
  ctx.font = f(9, false);
  ctx.textAlign = "center";
  ctx.fillText("U P T I M E", W / 2, 76);

  // 4 uptime segments
  const segs = [
    { v: pad(info.days),  l: "DAYS" },
    { v: pad(info.hours), l: "HRS"  },
    { v: pad(info.mins),  l: "MIN"  },
    { v: pad(info.secs),  l: "SEC"  },
  ];
  const segW = 104;
  const upX0 = (W - segs.length * segW) / 2;

  segs.forEach((seg, i) => {
    const cx = upX0 + i * segW + segW / 2;

    // Number
    ctx.fillStyle = "#58a6ff";
    ctx.font = f(36);
    ctx.textAlign = "center";
    ctx.fillText(seg.v, cx, 127);

    // Sub-label
    ctx.fillStyle = "#484f58";
    ctx.font = f(8, false);
    ctx.fillText(seg.l, cx, 141);

    // Colon separator
    if (i < 3) {
      ctx.fillStyle = "#30363d";
      ctx.font = f(26);
      ctx.fillText(":", upX0 + (i + 1) * segW, 122);
    }
  });

  // ── STATS GRID (147–370) — 2 cols × 4 rows ───────────────────────────────
  const SY   = 148;
  const ROW  = 56;
  const HALF = W / 2;

  const leftStats = [
    { label: "RAM Usage",     value: info.memMB + " MB",    color: "#ffa657" },
    { label: "Active Groups", value: String(info.groups),   color: "#58a6ff" },
    { label: "Commands",      value: String(info.commands), color: "#bc8cff" },
    { label: "Bot Prefix",    value: info.prefix,           color: "#e6edf3" },
  ];
  const rightStats = [
    { label: "Locked Groups", value: String(info.locked),   color: info.locked > 0 ? "#f85149" : "#6e7681" },
    { label: "Admins",        value: String(info.admins),   color: "#3fb950" },
    { label: "Platform",      value: info.platform,         color: "#8b949e" },
    { label: "Node.js",       value: process.version,       color: "#d29922" },
  ];

  // Vertical divider
  vline(ctx, HALF, SY, SY + ROW * 4);

  for (let row = 0; row < 4; row++) {
    const ry = SY + row * ROW;
    if (row > 0) hline(ctx, ry, 1, W - 1, "#161b22");

    // ── Left cell ──
    const L = leftStats[row];
    ctx.fillStyle = "#484f58";
    ctx.font = f(9, false);
    ctx.textAlign = "left";
    ctx.fillText(L.label.toUpperCase(), 20, ry + 20);

    ctx.fillStyle = L.color;
    ctx.font = f(20);
    ctx.fillText(L.value, 20, ry + 44);

    // ── Right cell ──
    const R = rightStats[row];
    ctx.fillStyle = "#484f58";
    ctx.font = f(9, false);
    ctx.fillText(R.label.toUpperCase(), HALF + 20, ry + 20);

    ctx.fillStyle = R.color;
    ctx.font = f(20);
    ctx.fillText(R.value, HALF + 20, ry + 44);
  }

  // ── FOOTER (372–412) ──────────────────────────────────────────────────────
  hline(ctx, 372, 1, W - 1, "#21262d");

  ctx.fillStyle = "#3d444d";
  ctx.font = f(10, false);
  ctx.textAlign = "center";
  const now = new Date().toLocaleString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "numeric", month: "short", year: "numeric",
  });
  ctx.fillText(now + "  \u2022  " + info.platform + " / " + process.version, W / 2, 396);

  return canvas.toBuffer("image/png");
}

module.exports = {
  name: "uptime",
  aliases: ["up"],
  description: "\u0639\u0631\u0636 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0628\u0648\u062a \u0643\u0635\u0648\u0631\u0629.",
  usage: "uptime",
  category: "General",

  async execute({ api, event, commands }) {
    const total  = Math.floor(process.uptime());
    const days   = Math.floor(total / 86400);
    const hours  = Math.floor((total % 86400) / 3600);
    const mins   = Math.floor((total % 3600) / 60);
    const secs   = total % 60;
    const memMB  = Math.round(process.memoryUsage().rss / 1024 / 1024);

    let groups = 0, locked = 0;
    try {
      const state = require("../state");
      groups = state.groupsCache.size;
      locked = state.lockedThreads.size;
    } catch {}

    const cmdCount = commands ? [...new Set(commands.values())].length : 0;
    const admins   = Array.isArray(config.bot.adminIDs) ? config.bot.adminIDs.length : 0;

    const info = {
      botName:  config.bot.name,
      version:  config.bot.version,
      prefix:   config.prefix,
      days, hours, mins, secs,
      memMB, groups, locked,
      commands: cmdCount,
      admins,
      platform: os.platform(),
    };

    const tmpFile = path.join(os.tmpdir(), "uptime_" + Date.now() + ".png");
    try {
      const buf = await buildCard(info);
      fs.writeFileSync(tmpFile, buf);
      await api.sendMessage(
        { body: "", attachment: fs.createReadStream(tmpFile) },
        event.threadID
      );
    } catch (err) {
      // Text fallback
      api.sendMessage(
        info.botName + " v" + info.version + "\n" +
        "Uptime: " + days + "d " + hours + "h " + mins + "m " + secs + "s\n" +
        "RAM: " + memMB + " MB  |  Groups: " + groups + "  |  Commands: " + cmdCount,
        event.threadID
      );
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  },
};
