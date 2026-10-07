// ==UserScript==
// @name         Cloudy's Attack Intel
// @namespace    https://github.com/gregapackard/torn-attack-intel
// @version      1.0.1
// @description  Live target intel on Torn attack pages: last action, online state, status, faction, and configurable activity qualification.
// @author       CloudyMuffin440
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.torn.com
// @updateURL    https://raw.githubusercontent.com/gregapackard/torn-attack-intel/main/cloudys-attack-intel.user.js
// @downloadURL  https://raw.githubusercontent.com/gregapackard/torn-attack-intel/main/cloudys-attack-intel.user.js
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.0.1";
  const PDA_KEY = "###PDA-APIKEY###";
  const API = "https://api.torn.com/v2";
  const KEY_API = "cloudyAttackIntel.apiKey";
  const KEY_THRESHOLD = "cloudyAttackIntel.threshold";
  const KEY_REFRESH = "cloudyAttackIntel.refresh";
  const DEFAULT_THRESHOLD = 10;
  const DEFAULT_REFRESH = 20;

  let targetId = null;
  let data = null;
  let faction = null;
  let loading = false;
  let lastFetch = 0;
  let timer = null;
  let tickTimer = null;
  let routeTimer = null;

  const get = (k, d = "") => {
    try {
      const v = GM_getValue(k);
      if (v !== undefined && v !== null && v !== "") return v;
    } catch {}
    try { return localStorage.getItem(k) ?? d; } catch { return d; }
  };
  const set = (k, v) => {
    try { GM_setValue(k, v); } catch {}
    try { localStorage.setItem(k, String(v)); } catch {}
  };

  function apiKey() {
    return PDA_KEY !== "###PDA-APIKEY###" ? PDA_KEY : get(KEY_API, "");
  }

  function request(url) {
    const headers = apiKey() ? { Authorization: "ApiKey " + apiKey() } : {};
    const parse = r => {
      const status = +(r?.status ?? r?.statusCode ?? 200);
      const raw = r?.responseText ?? r?.response ?? r?.body ?? r?.data ?? r?.result ?? r;
      let j = raw;
      if (typeof raw === "string") {
        try { j = raw ? JSON.parse(raw) : null; } catch {}
      }
      if (status < 200 || status >= 300) throw new Error(j?.error?.error || j?.error?.message || j?.message || "HTTP " + status);
      if (j?.error) throw new Error(j.error.error || j.error.message || "Torn API error");
      return j;
    };

    if (typeof PDA_httpGet === "function") {
      return PDA_httpGet(url, headers).then(parse);
    }

    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: "GET",
      url,
      headers,
      onload: r => { try { resolve(parse(r)); } catch (e) { reject(e); } },
      onerror: () => reject(new Error("Network request failed"))
    }));
  }

  async function torn(path) {
    if (!apiKey()) throw new Error("API key required");
    return request(API + path);
  }

  function extractTargetId() {
    const u = new URL(location.href);
    const candidates = [
      u.searchParams.get("user2ID"),
      u.searchParams.get("userID"),
      u.searchParams.get("XID"),
      u.searchParams.get("ID")
    ];
    const hash = location.hash || "";
    for (const key of ["user2ID", "userID", "XID", "ID"]) {
      const m = hash.match(new RegExp("(?:[?&#]|^)" + key + "=(\\d+)", "i"));
      if (m) candidates.unshift(m[1]);
    }
    const id = candidates.find(x => /^\d+$/.test(String(x || "")));
    return id ? +id : null;
  }

  function isAttackPage() {
    return /(?:[?&#]|^)sid=attack(?:&|$)/i.test(location.search + "&" + location.hash) ||
           /loader\.php/i.test(location.pathname) && /sid=attack/i.test(location.href);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function ageSeconds() {
    const ts = +(data?.last_action?.timestamp || data?.last_action?.time || 0);
    return ts ? Math.max(0, Math.floor(Date.now() / 1000 - ts)) : null;
  }

  function ageText(sec) {
    if (sec == null) return "Unknown";
    if (sec < 60) return sec + "s ago";
    if (sec < 3600) return Math.floor(sec / 60) + "m " + (sec % 60) + "s ago";
    if (sec < 86400) return Math.floor(sec / 3600) + "h " + Math.floor((sec % 3600) / 60) + "m ago";
    return Math.floor(sec / 86400) + "d " + Math.floor((sec % 86400) / 3600) + "h ago";
  }

  function heat(sec) {
    if (sec == null) return { cls:"unknown", label:"UNKNOWN" };
    if (sec <= 120) return { cls:"hot", label:"HOT" };
    if (sec <= 300) return { cls:"recent", label:"RECENT" };
    if (sec <= 900) return { cls:"stale", label:"STALE" };
    return { cls:"cold", label:"COLD" };
  }

  function stateText() {
    return data?.last_action?.status || data?.last_action?.state || "Unknown";
  }

  function statusText() {
    const s = data?.status || {};
    return s.description || s.state || "Unknown";
  }

  function untilText() {
    const until = +(data?.status?.until || 0);
    if (!until || until <= Date.now() / 1000) return "";
    const sec = Math.max(0, Math.ceil(until - Date.now() / 1000));
    return " • " + ageText(sec).replace(" ago", "") + " left";
  }

  function mount() {
    if (document.querySelector("#cloudy-attack-intel")) return;
    const el = document.createElement("div");
    el.id = "cloudy-attack-intel";
    el.innerHTML = `
      <style>
        #cloudy-attack-intel{position:fixed;z-index:999999;top:52px;left:50%;transform:translateX(-50%);width:min(920px,calc(100vw - 16px));font:12px Arial,sans-serif;color:#e9edf2;pointer-events:none}
        #cloudy-attack-intel .cai{pointer-events:auto;background:rgba(18,20,24,.97);border:1px solid #424852;border-radius:9px;box-shadow:0 5px 22px #000a;overflow:hidden}
        #cloudy-attack-intel .main{display:flex;align-items:center;gap:10px;padding:7px 10px;min-height:34px}
        #cloudy-attack-intel .brand{font-weight:900;white-space:nowrap;color:#fff}
        #cloudy-attack-intel .pill{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:6px;background:#292d34;border:1px solid #3b414b;white-space:nowrap;font-weight:700}
        #cloudy-attack-intel .hot{background:#153d2d;border-color:#2b8c62;color:#73efb4}
        #cloudy-attack-intel .recent{background:#4a4217;border-color:#9d8c2c;color:#ffe36e}
        #cloudy-attack-intel .stale{background:#513219;border-color:#a7632a;color:#ffb266}
        #cloudy-attack-intel .cold{background:#4b1d22;border-color:#a53b46;color:#ff7b86}
        #cloudy-attack-intel .unknown{background:#30343b;color:#bdc4ce}
        #cloudy-attack-intel .pass{background:#143b2a;border-color:#2b8c62;color:#6ce5aa}
        #cloudy-attack-intel .fail{background:#4a1d22;border-color:#a53b46;color:#ff7b86}
        #cloudy-attack-intel .grow{flex:1;min-width:0}
        #cloudy-attack-intel button{border:1px solid #505762;background:#30353d;color:#fff;border-radius:5px;min-height:28px;padding:4px 8px;font-weight:700;cursor:pointer}
        #cloudy-attack-intel button:hover{background:#414852}
        #cloudy-attack-intel .settings{display:none;border-top:1px solid #343941;padding:8px 10px;background:#14161a}
        #cloudy-attack-intel.open .settings{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        #cloudy-attack-intel input{background:#0d0f12;color:#eee;border:1px solid #3e444e;border-radius:5px;padding:6px;min-height:28px;box-sizing:border-box}
        #cloudy-attack-intel .key{width:250px;max-width:60vw}
        #cloudy-attack-intel .num{width:65px}
        #cloudy-attack-intel .dim{color:#969faa;font-weight:400}
        #cloudy-attack-intel .error{color:#ff7b86;font-weight:700}
        @media(max-width:700px){
          #cloudy-attack-intel{top:6px;width:calc(100vw - 10px);font-size:11px}
          #cloudy-attack-intel .main{gap:5px;padding:5px;flex-wrap:wrap}
          #cloudy-attack-intel .brand{width:100%;text-align:center;font-size:10px}
          #cloudy-attack-intel .pill{padding:4px 5px}
          #cloudy-attack-intel .grow{display:none}
          #cloudy-attack-intel .key{width:100%;max-width:none;font-size:16px}
          #cloudy-attack-intel input.num{font-size:16px}
        }
      </style>
      <div class="cai">
        <div class="main"><span class="brand">CLOUDY'S ATTACK INTEL</span><span class="dim">Waiting for target…</span></div>
        <div class="settings">
          <input class="key" type="password" placeholder="Torn API key (Public or higher)">
          <label>Active ≤ <input class="num threshold" type="number" min="1" max="1440"> min</label>
          <label>Refresh <input class="num refresh" type="number" min="10" max="300"> sec</label>
          <button class="save">Save & Refresh</button>
          <span class="dim">v${VERSION}</span>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector(".key").value = apiKey();
    el.querySelector(".threshold").value = +get(KEY_THRESHOLD, DEFAULT_THRESHOLD);
    el.querySelector(".refresh").value = +get(KEY_REFRESH, DEFAULT_REFRESH);
    el.querySelector(".save").onclick = () => {
      const key = el.querySelector(".key").value.trim();
      const th = Math.max(1, Math.min(1440, +el.querySelector(".threshold").value || DEFAULT_THRESHOLD));
      const rf = Math.max(10, Math.min(300, +el.querySelector(".refresh").value || DEFAULT_REFRESH));
      set(KEY_API, key); set(KEY_THRESHOLD, th); set(KEY_REFRESH, rf);
      el.classList.remove("open");
      fetchIntel(true);
      schedule();
    };
  }

  function render(message = "") {
    mount();
    const root = document.querySelector("#cloudy-attack-intel");
    if (!root) return;
    const main = root.querySelector(".main");

    if (!apiKey()) {
      main.innerHTML = `<span class="brand">CLOUDY'S ATTACK INTEL</span><span class="pill unknown">API KEY NEEDED</span><span class="grow dim">Public access is enough; Limited also works.</span><button class="gear">⚙ Setup</button>`;
      main.querySelector(".gear").onclick = () => root.classList.toggle("open");
      return;
    }

    if (message && !data) {
      main.innerHTML = `<span class="brand">CLOUDY'S ATTACK INTEL</span><span class="error">${esc(message)}</span><span class="grow"></span><button class="refreshBtn">↻</button><button class="gear">⚙</button>`;
      main.querySelector(".refreshBtn").onclick = () => fetchIntel(true);
      main.querySelector(".gear").onclick = () => root.classList.toggle("open");
      return;
    }

    if (!data) {
      main.innerHTML = `<span class="brand">CLOUDY'S ATTACK INTEL</span><span class="dim">Loading target #${esc(targetId)}…</span>`;
      return;
    }

    const sec = ageSeconds();
    const h = heat(sec);
    const threshold = +get(KEY_THRESHOLD, DEFAULT_THRESHOLD);
    const qualifies = sec != null && sec <= threshold * 60;
    const fac = faction?.faction || faction;
    const factionName = fac?.name || fac?.faction_name || data?.faction?.name || "No faction";
    const lvl = data?.level ?? data?.player?.level ?? "?";
    const name = data?.name || data?.player?.name || ("#" + targetId);
    const state = stateText();
    const st = statusText();

    main.innerHTML = `
      <span class="brand">${esc(name)} [${esc(targetId)}]</span>
      <span class="pill ${h.cls}" title="Torn last action timestamp">${h.label} • ${esc(ageText(sec))}</span>
      <span class="pill ${qualifies ? "pass" : "fail"}">${qualifies ? "✓" : "✗"} ≤${threshold}m</span>
      <span class="pill">${esc(state)}</span>
      <span class="pill" title="${esc(data?.status?.details || "")}">${esc(st + untilText())}</span>
      <span class="pill">Lv ${esc(lvl)}</span>
      <span class="pill">${esc(factionName)}</span>
      <span class="grow dim">${message ? esc(message) : "Updated " + Math.max(0, Math.floor((Date.now()-lastFetch)/1000)) + "s ago"}</span>
      <button class="refreshBtn" title="Refresh now">↻</button>
      <button class="gear" title="Settings">⚙</button>`;
    main.querySelector(".refreshBtn").onclick = () => fetchIntel(true);
    main.querySelector(".gear").onclick = () => root.classList.toggle("open");
  }

  async function fetchIntel(force = false) {
    if (!isAttackPage() || !targetId || loading || !apiKey()) { render(); return; }
    if (!force && Date.now() - lastFetch < 5000) return;
    loading = true;
    if (!data) render();
    try {
      const [b, f] = await Promise.all([
        torn("/user/" + targetId + "/basic?striptags=true&timestamp=" + Math.floor(Date.now()/1000)),
        torn("/user/" + targetId + "/faction?timestamp=" + Math.floor(Date.now()/1000)).catch(() => null)
      ]);
      data = b?.profile || b?.user || b;
      faction = f;
      lastFetch = Date.now();
      render();
    } catch (e) {
      render(e?.message || "Unable to load target intel");
    } finally {
      loading = false;
    }
  }

  function schedule() {
    clearInterval(timer);
    const sec = Math.max(10, Math.min(300, +get(KEY_REFRESH, DEFAULT_REFRESH) || DEFAULT_REFRESH));
    timer = setInterval(() => fetchIntel(false), sec * 1000);
  }

  function routeCheck() {
    const id = extractTargetId();
    const attack = isAttackPage();
    const root = document.querySelector("#cloudy-attack-intel");
    if (!attack || !id) {
      if (root) root.style.display = "none";
      return;
    }
    if (root) root.style.display = "";
    if (id !== targetId) {
      targetId = id;
      data = null;
      faction = null;
      lastFetch = 0;
      render();
      fetchIntel(true);
    }
  }

  function init() {
    mount();
    schedule();
    routeCheck();
    routeTimer = setInterval(routeCheck, 750);
    tickTimer = setInterval(() => { if (data && isAttackPage()) render(); }, 1000);
    window.addEventListener("popstate", routeCheck);
    window.addEventListener("hashchange", routeCheck);
  }

  init();
})();