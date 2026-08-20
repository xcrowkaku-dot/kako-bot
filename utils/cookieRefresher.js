"use strict";

/**
 * cookieRefresher.js
 *
 * Automatically saves and pushes Facebook session cookies to GitHub
 * every INTERVAL_MS. Uses SHA-1 change detection so GitHub is only
 * called when cookies actually changed — avoiding rate-limit waste.
 *
 * Safe to call start() again on reconnect — always resets cleanly.
 */

const crypto = require("crypto");
const logger  = require("./logger");

const INTERVAL_MS  = 4 * 60 * 1000;   // 4 minutes between checks
const FIRST_TICK   = 30 * 1000;        // first tick 30s after start (let connection settle)
const MIN_PUSH_GAP = 60 * 1000;        // never push more often than once per minute (safety net)

let _timer      = null;
let _firstTimer = null;
let _api        = null;
let _session    = null;

// Metrics
let _lastHash   = null;
let _lastPushAt = 0;
let _pushCount  = 0;
let _skipCount  = 0;
let _errorCount = 0;
let _startedAt  = 0;

// ── Internal helpers ──────────────────────────────────────────────────────────

function _hashState(state) {
  try {
    return crypto.createHash("sha1").update(JSON.stringify(state)).digest("hex");
  } catch {
    return null;
  }
}

async function _tick() {
  if (!_api || !_session) return;

  // 1. Read current session from the live connection
  let state;
  try {
    state = _api.getAppState();
  } catch (e) {
    _errorCount++;
    logger.warn("CookieRefresher", "getAppState() failed: " + e.message);
    return;
  }

  if (!Array.isArray(state) || state.length === 0) {
    logger.debug("CookieRefresher", "State is empty — skipping.");
    return;
  }

  // 2. Hash comparison — only push if cookies actually changed
  const hash    = _hashState(state);
  const now     = Date.now();
  const changed = hash && hash !== _lastHash;
  const gapOk   = now - _lastPushAt >= MIN_PUSH_GAP;

  if (!changed) {
    _skipCount++;
    logger.debug("CookieRefresher", "No cookie change detected (skip #" + _skipCount + ").");
    return;
  }

  if (!gapOk) {
    logger.debug("CookieRefresher", "Min push gap not met — skipping this tick.");
    return;
  }

  // 3. Save locally + push to GitHub
  try {
    const saved = await _session.saveAndPush(state);
    if (saved) {
      _lastHash   = hash;
      _lastPushAt = now;
      _pushCount++;
      logger.success(
        "CookieRefresher",
        "Cookies saved & pushed to GitHub ✅ " +
        "(push #" + _pushCount + " | " + state.length + " entries)"
      );
    } else {
      logger.warn("CookieRefresher", "saveAndPush returned false — local write may have failed.");
      _errorCount++;
    }
  } catch (e) {
    _errorCount++;
    logger.warn("CookieRefresher", "Push failed: " + e.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start (or restart) the cookie refresh loop.
 * Safe to call multiple times — always resets the previous timer.
 *
 * @param {object} api     — nkxfca API instance with .getAppState()
 * @param {object} session — SessionManager instance with .saveAndPush()
 */
function start(api, session) {
  // Stop any existing timers cleanly
  stop();

  _api       = api;
  _session   = session;
  _lastHash  = null;    // Force a push on the first tick
  _lastPushAt = 0;
  _pushCount = 0;
  _skipCount = 0;
  _errorCount = 0;
  _startedAt = Date.now();

  // First tick after 30 seconds, then every 4 minutes
  _firstTimer = setTimeout(() => {
    _firstTimer = null;
    _tick().catch(e => logger.warn("CookieRefresher", "First tick error: " + e.message));

    _timer = setInterval(
      () => _tick().catch(e => logger.warn("CookieRefresher", "Tick error: " + e.message)),
      INTERVAL_MS
    );
    if (_timer.unref) _timer.unref();
  }, FIRST_TICK);
  if (_firstTimer.unref) _firstTimer.unref();

  logger.info(
    "CookieRefresher",
    "Started — first push in " + (FIRST_TICK / 1000) + "s, " +
    "then every " + (INTERVAL_MS / 60000) + " minutes."
  );
}

/**
 * Stop the refresh loop. Called automatically on reconnect.
 */
function stop() {
  if (_firstTimer) { clearTimeout(_firstTimer);  _firstTimer = null; }
  if (_timer)      { clearInterval(_timer);       _timer      = null; }
  _api     = null;
  _session = null;
}

/**
 * Force an immediate push regardless of interval.
 * Used by the dashboard /cookies/refresh endpoint.
 */
async function forceRefresh() {
  if (!_api || !_session) throw new Error("CookieRefresher not running.");
  _lastHash = null; // Clear hash so change detection always triggers
  await _tick();
  return status();
}

/**
 * Returns current status metrics.
 */
function status() {
  return {
    active:          !!_timer || !!_firstTimer,
    intervalMinutes: INTERVAL_MS / 60000,
    firstTickSec:    FIRST_TICK / 1000,
    pushCount:       _pushCount,
    skipCount:       _skipCount,
    errorCount:      _errorCount,
    lastPushAt:      _lastPushAt || null,
    uptimeSec:       _startedAt ? Math.floor((Date.now() - _startedAt) / 1000) : 0,
  };
}

module.exports = { start, stop, forceRefresh, status };
