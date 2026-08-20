"use strict";

/**
 * humanSimulator — makes the bot account look like a real human to Facebook.
 *
 * Behaviors simulated:
 *  1. Presence heartbeat      — keeps account "online"
 *  2. Typing indicator bursts — mimics composing a reply (uses proper stop fn)
 *  3. Periodic read marks     — mimics opening individual threads
 *  4. Browse sessions         — simulates scrolling inbox: opens multiple
 *     threads in sequence with human-like reading pauses, occasionally starts
 *     then stops typing (as if reconsidering a reply). This burst-then-idle
 *     pattern is what real Messenger usage looks like to Facebook's systems.
 */

const logger = require("./logger");

const DEFAULT_CONFIG = {
  enabled:             true,
  presenceIntervalMs:  5  * 60_000,   // online heartbeat every 5 min
  typingIntervalMs:    12 * 60_000,   // typing sim every 12 min
  readIntervalMs:      4  * 60_000,   // mark-read every 4 min
  browseIntervalMs:    18 * 60_000,   // browse session every 18 min
  jitterMs:            45_000,        // ±45 s jitter on all timers
  maxTypingMs:         5_000,         // max typing duration ms
  maxGroupsPerCycle:   3,             // threads per read cycle
  browseBatchSize:     6,             // threads per browse session
};

let _api     = null;
let _cfg     = { ...DEFAULT_CONFIG };
let _timers  = [];
let _running = false;
let _stats   = {
  startedAt:       null,
  presenceSent:    0,
  typingSimulated: 0,
  threadsRead:     0,
  browseSessions:  0,
  lastActionAt:    null,
  lastActionType:  null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _jitter(baseMs) {
  const j = _cfg.jitterMs || 45_000;
  return Math.max(5_000, baseMs + Math.floor((Math.random() * 2 - 1) * j));
}

function _randomGroupIDs(max) {
  try {
    const { groupsCache } = require("../state");
    const ids = [...groupsCache.keys()];
    if (ids.length === 0) return [];
    return ids.sort(() => Math.random() - 0.5).slice(0, max);
  } catch { return []; }
}

function _sleep(minMs, maxMs = minMs) {
  return new Promise(r => setTimeout(r, minMs + Math.floor(Math.random() * (maxMs - minMs))));
}

function _record(type) {
  _stats.lastActionAt   = Date.now();
  _stats.lastActionType = type;
}

function _schedule(fn, delayMs) {
  const t = setTimeout(fn, delayMs);
  t.unref();
  _timers.push(t);
}

// ── 1. Presence heartbeat ─────────────────────────────────────────────────────
function _doPresence() {
  _schedule(async () => {
    if (!_running || !_api) return;
    try {
      if (typeof _api.setOptions === "function") _api.setOptions({ online: true });
      _stats.presenceSent++;
      _record("presence");
      logger.debug("HumanSim", `Presence heartbeat #${_stats.presenceSent}`);
    } catch (e) { logger.debug("HumanSim", `Presence error: ${e.message}`); }
    _doPresence();
  }, _jitter(_cfg.presenceIntervalMs));
}

// ── 2. Typing simulation ──────────────────────────────────────────────────────
function _doTyping() {
  _schedule(async () => {
    if (!_running || !_api) return;
    const [threadID] = _randomGroupIDs(1);
    if (threadID) {
      try {
        const duration  = 1_200 + Math.floor(Math.random() * _cfg.maxTypingMs);
        // nkxfca's sendTypingIndicator returns a stop callback
        const stopFn    = await _api.sendTypingIndicator(threadID);
        await _sleep(duration);
        if (typeof stopFn === "function") stopFn();
        _stats.typingSimulated++;
        _record("typing");
        logger.debug("HumanSim", `Typing in ${threadID} for ${duration}ms`);
      } catch (e) { logger.debug("HumanSim", `Typing error ${threadID}: ${e.message}`); }
    }
    _doTyping();
  }, _jitter(_cfg.typingIntervalMs));
}

// ── 3. Mark threads as read ───────────────────────────────────────────────────
function _doRead() {
  _schedule(async () => {
    if (!_running || !_api) return;
    for (const threadID of _randomGroupIDs(_cfg.maxGroupsPerCycle)) {
      try {
        await _api.markAsRead(threadID, true);
        _stats.threadsRead++;
        _record("markRead");
        logger.debug("HumanSim", `Marked ${threadID} as read`);
        await _sleep(700, 2_500);
      } catch (e) { logger.debug("HumanSim", `markAsRead error ${threadID}: ${e.message}`); }
    }
    _doRead();
  }, _jitter(_cfg.readIntervalMs));
}

// ── 4. Browse session ─────────────────────────────────────────────────────────
// Simulates opening the Messenger app and scrolling through the inbox.
// Pattern: open thread → read (pause) → maybe start typing then abandon → next thread.
// The burst-then-idle pattern mimics real human Messenger usage.
function _doBrowse() {
  _schedule(async () => {
    if (!_running || !_api) return;

    const batch = _randomGroupIDs(_cfg.browseBatchSize || 6);
    if (batch.length === 0) { _doBrowse(); return; }

    logger.debug("HumanSim", `Browse session — ${batch.length} threads`);

    for (const threadID of batch) {
      if (!_running) break;
      try {
        // "Open" the thread — mark as read (simulates tapping the conversation)
        await _api.markAsRead(threadID, true);
        _stats.threadsRead++;
        _record("browse");

        // Simulate reading time (1–5 s depending on "message length")
        await _sleep(1_000, 5_000);

        // 30% chance: start typing then abandon (reconsidering a reply)
        if (Math.random() < 0.30) {
          try {
            const stopFn = await _api.sendTypingIndicator(threadID);
            await _sleep(700, 2_200); // "thinking" duration
            if (typeof stopFn === "function") stopFn();
          } catch { /* ignore */ }
        }

        // Short scroll-pause between threads (300–1 500 ms)
        await _sleep(300, 1_500);
      } catch (e) { logger.debug("HumanSim", `Browse error ${threadID}: ${e.message}`); }
    }

    _stats.browseSessions++;
    logger.debug("HumanSim", `Browse session #${_stats.browseSessions} complete`);
    _doBrowse();
  }, _jitter(_cfg.browseIntervalMs));
}

// ── Public API ────────────────────────────────────────────────────────────────
function start(api, userConfig = {}) {
  if (_running) stop();
  _api     = api;
  _cfg     = { ...DEFAULT_CONFIG, ...userConfig };
  _running = true;
  _timers  = [];
  _stats   = {
    startedAt:       Date.now(),
    presenceSent:    0,
    typingSimulated: 0,
    threadsRead:     0,
    browseSessions:  0,
    lastActionAt:    null,
    lastActionType:  null,
  };

  // Stagger start times so nothing fires all at once on login
  const stagger = [
    [_doPresence,  60_000 + Math.floor(Math.random() * 30_000)],
    [_doTyping,   100_000 + Math.floor(Math.random() * 30_000)],
    [_doRead,      35_000 + Math.floor(Math.random() * 15_000)],
    [_doBrowse,   300_000 + Math.floor(Math.random() * 60_000)],
  ];
  for (const [fn, offset] of stagger) {
    const t = setTimeout(fn, offset);
    t.unref();
    _timers.push(t);
  }

  logger.info("HumanSim", [
    "Started —",
    `presence:${_cfg.presenceIntervalMs / 60_000}m`,
    `typing:${_cfg.typingIntervalMs / 60_000}m`,
    `read:${_cfg.readIntervalMs / 60_000}m`,
    `browse:${_cfg.browseIntervalMs / 60_000}m`,
  ].join(" "));
}

function stop() {
  _running = false;
  for (const t of _timers) clearTimeout(t);
  _timers = [];
  logger.info("HumanSim", "Stopped.");
}

function configure(newConfig) {
  _cfg = { ..._cfg, ...newConfig };
  if (_running && _api) { stop(); start(_api, _cfg); }
}

function status() {
  return { running: _running, config: { ..._cfg }, stats: { ..._stats } };
}

module.exports = { start, stop, configure, status };
