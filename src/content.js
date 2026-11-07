// YT AI Filter — content script
(() => {
  "use strict";

  let cfg = structuredClone(YTAF_DEFAULTS);
  let keywordRe = null;

  // 영상 카드로 취급할 요소들 (데스크톱 + 모바일, 신/구 레이아웃)
  const CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-playlist-video-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-video-with-context-renderer",
    "ytm-compact-video-renderer"
  ].join(",");

  // ---------- 설정 ----------
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildKeywordRe() {
    const list = (cfg.keywords || []).map((k) => k.trim()).filter(Boolean);
    keywordRe = list.length ? new RegExp(list.map(escapeRe).join("|"), "i") : null;
  }

  async function loadConfig() {
    const stored = await chrome.storage.local.get(YTAF_DEFAULTS);
    cfg = { ...YTAF_DEFAULTS, ...stored };
    buildKeywordRe();
  }

  chrome.storage.onChanged.addListener(async (changes) => {
    // 카운터만 바뀐 경우는 무시 (재스캔 → 카운트 → 재스캔 루프 방지)
    if (Object.keys(changes).every((k) => k === "filteredCount")) return;
    await loadConfig();
    rescanAll();
  });

  // ---------- 카드 정보 추출 ----------
  function channelKeyFromHref(href) {
    if (!href) return null;
    const m = href.match(/\/(@[^/?#]+)|\/channel\/(UC[\w-]+)/);
    if (!m) return null;
    return m[1] ? decodeURIComponent(m[1]).toLowerCase() : m[2];
  }

  function getChannel(card) {
    const a = card.querySelector('a[href^="/@"], a[href*="/channel/UC"]');
    if (!a) return { key: null, name: "" };
    const name =
      (a.textContent || "").trim() ||
      a.getAttribute("title") ||
      a.getAttribute("aria-label") ||
      "";
    return { key: channelKeyFromHref(a.getAttribute("href")), name };
  }

  function getTitle(card) {
    const el = card.querySelector(
      "#video-title, #video-title-link, a#video-title, h3, .yt-lockup-metadata-view-model-wiz__title, [class*='title']"
    );
    return (el?.getAttribute("title") || el?.textContent || "").trim();
  }

  // ---------- 판정 ----------
  function judge(card) {
    const ch = getChannel(card);
    if (ch.key && cfg.allowedChannels[ch.key]) return null;
    if (ch.key && cfg.blockedChannels[ch.key]) return "차단 채널";

    const text = card.innerText || "";
    if (YTAF_LABEL_PATTERNS.some((re) => re.test(text))) return "AI 라벨";

    const title = getTitle(card);
    if (keywordRe && keywordRe.test(title)) return "AI 키워드";
    return null;
  }

  // ---------- 적용 ----------
  function clearMarks(card) {
    card.classList.remove("ytaf-hidden", "ytaf-blur");
    card.querySelector(":scope > .ytaf-badge")?.remove();
  }

  function apply(card, reason) {
    const prev = card.dataset.ytafReason || "";
    clearMarks(card);
    card.dataset.ytafReason = reason || "";
    if (!reason) return;
    if (cfg.mode === "blur") {
      card.classList.add("ytaf-blur");
      const badge = document.createElement("span");
      badge.className = "ytaf-badge";
      badge.textContent = `AI · ${reason}`;
      card.prepend(badge);
    } else {
      card.classList.add("ytaf-hidden");
    }
    if (!prev) bumpCount(); // 새로 걸러진 카드만 집계
  }

  function ensureBlockButton(card) {
    if (!cfg.showBlockButton) {
      card.querySelector(":scope > .ytaf-btn")?.remove();
      return;
    }
    if (card.querySelector(":scope > .ytaf-btn")) return;
    card.classList.add("ytaf-card");
    if (getComputedStyle(card).position === "static") card.style.position = "relative";

    const btn = document.createElement("button");
    btn.className = "ytaf-btn";
    btn.title = "이 채널을 AI 채널로 차단";
    btn.textContent = "🚫";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ch = getChannel(card);
      if (!ch.key) {
        alert("채널 정보를 찾지 못했습니다.");
        return;
      }
      await blockChannel(ch.key, ch.name);
    });
    card.prepend(btn);
  }

  function process(card) {
    if (!cfg.enabled) {
      clearMarks(card);
      return;
    }
    ensureBlockButton(card);
    if (cfg.hideAllShorts && isShortsCard(card)) {
      apply(card, "쇼츠");
      card.classList.replace("ytaf-blur", "ytaf-hidden");
      return;
    }
    apply(card, judge(card));
    card.dataset.ytafDone = "1";
  }

  function rescanAll() {
    document.querySelectorAll(CARD_SELECTOR).forEach(process);
    applyShortsShelves();
    checkWatchPage();
    checkShortsPage();
  }

  // ---------- 채널 차단 ----------
  async function blockChannel(key, name) {
    const { blockedChannels = {} } = await chrome.storage.local.get("blockedChannels");
    blockedChannels[key] = name || key;
    await chrome.storage.local.set({ blockedChannels });
  }

  // ---------- 카운터 ----------
  let pending = 0;
  let flushTimer = null;
  function bumpCount() {
    pending++;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      const n = pending;
      pending = 0;
      const { filteredCount = 0 } = await chrome.storage.local.get("filteredCount");
      await chrome.storage.local.set({ filteredCount: filteredCount + n });
    }, 1500);
  }

  // ---------- 쇼츠 ----------
  const SHORTS_SHELF_SELECTOR = [
    "ytd-reel-shelf-renderer",
    "ytd-rich-shelf-renderer[is-shorts]",
    "ytm-reel-shelf-renderer",
    "grid-shelf-view-model"
  ].join(",");

  function isShortsCard(card) {
    return (
      /reel|shorts/i.test(card.tagName) ||
      !!card.querySelector('a[href^="/shorts/"]')
    );
  }

  // 피드의 쇼츠 선반 전체 숨김 옵션
  function applyShortsShelves() {
    document.querySelectorAll(SHORTS_SHELF_SELECTOR).forEach((shelf) => {
      const isShorts =
        shelf.tagName !== "GRID-SHELF-VIEW-MODEL" || !!shelf.querySelector('a[href^="/shorts/"]');
      shelf.classList.toggle("ytaf-hidden", cfg.enabled && cfg.hideAllShorts && isShorts);
    });
    // 사이드바 "Shorts" 메뉴도 같이 숨김
    document
      .querySelectorAll('ytd-guide-entry-renderer a[title="Shorts"], ytd-mini-guide-entry-renderer[aria-label="Shorts"]')
      .forEach((el) => {
        const host = el.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer") || el;
        host.classList.toggle("ytaf-hidden", cfg.enabled && cfg.hideAllShorts);
      });
  }

  function getActiveReel() {
    return (
      document.querySelector("ytd-reel-video-renderer[is-active]") ||
      document.querySelector("ytm-reel-player-overlay-renderer")?.closest("ytm-reel-item, div") ||
      null
    );
  }

  function skipToNextShort() {
    const btn = document.querySelector(
      "#navigation-button-down button, button[aria-label*='다음 동영상'], button[aria-label*='Next video']"
    );
    if (btn) {
      btn.click();
      return;
    }
    const ev = { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true };
    document.dispatchEvent(new KeyboardEvent("keydown", ev));
    document.dispatchEvent(new KeyboardEvent("keyup", ev));
  }

  function toast(text) {
    document.querySelector(".ytaf-toast")?.remove();
    const t = document.createElement("div");
    t.className = "ytaf-toast";
    t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }

  let lastShortId = null;
  function checkShortsPage() {
    if (!cfg.enabled || !location.pathname.startsWith("/shorts/")) return;
    const id = location.pathname.split("/")[2];
    const reel = getActiveReel();
    if (!reel || !id || lastShortId === id) return;

    const ch = getChannel(reel);
    if (!ch.key) return; // 오버레이가 아직 안 그려짐 → 다음 변경 때 재시도
    lastShortId = id;
    if (cfg.allowedChannels[ch.key]) return;

    const overlay = reel.innerText || "";
    let reason = null;
    if (cfg.blockedChannels[ch.key]) reason = "차단 채널";
    else if (YTAF_LABEL_PATTERNS.some((re) => re.test(overlay))) {
      reason = "AI 라벨";
      if (cfg.autoBlockLabeled) blockChannel(ch.key, ch.name);
    } else if (keywordRe && keywordRe.test(overlay)) reason = "AI 키워드";
    if (!reason) return;

    bumpCount();
    if (cfg.shortsAutoSkip) {
      toast(`AI 쇼츠 건너뜀 · ${reason}${ch.name ? ` · ${ch.name}` : ""}`);
      setTimeout(skipToNextShort, 400);
    } else {
      toast(`⚠️ AI 쇼츠 · ${reason}`);
    }
  }

  // ---------- 시청 페이지: AI 라벨 감지 ----------
  let lastWatchId = null;
  function checkWatchPage() {
    if (!cfg.enabled || location.pathname !== "/watch") return;
    const vid = new URLSearchParams(location.search).get("v");
    const owner = document.querySelector("ytd-watch-metadata #owner, #owner");
    const below = document.querySelector("ytd-watch-metadata, #below");
    if (!owner || !below) return;

    const labelHit = YTAF_LABEL_PATTERNS.some((re) => re.test(below.innerText || ""));
    if (!labelHit) return;
    if (lastWatchId === vid && document.querySelector(".ytaf-banner")) return;
    lastWatchId = vid;

    const a = owner.querySelector('a[href^="/@"], a[href*="/channel/UC"]');
    const key = channelKeyFromHref(a?.getAttribute("href"));
    const name = (owner.querySelector("#channel-name")?.innerText || a?.textContent || "").trim();
    if (!key) return;

    if (cfg.autoBlockLabeled && !cfg.allowedChannels[key] && !cfg.blockedChannels[key]) {
      blockChannel(key, name);
    }
    showBanner(below, key, name);
  }

  function showBanner(host, key, name) {
    document.querySelector(".ytaf-banner")?.remove();
    const div = document.createElement("div");
    div.className = "ytaf-banner";
    const msg = document.createElement("span");
    const blocked = cfg.autoBlockLabeled || cfg.blockedChannels[key];
    msg.textContent = blocked
      ? `⚠️ AI 생성 콘텐츠 라벨 감지 — '${name}' 채널을 차단 목록에 추가했습니다.`
      : `⚠️ 유튜브가 이 영상을 AI 생성/합성 콘텐츠로 표시했습니다.`;
    div.append(msg);

    const btn = document.createElement("button");
    if (blocked) {
      btn.textContent = "차단 취소";
      btn.onclick = async () => {
        const { blockedChannels = {}, allowedChannels = {} } =
          await chrome.storage.local.get(["blockedChannels", "allowedChannels"]);
        delete blockedChannels[key];
        allowedChannels[key] = name || key;
        await chrome.storage.local.set({ blockedChannels, allowedChannels });
        div.remove();
      };
    } else {
      btn.textContent = "채널 차단";
      btn.onclick = async () => {
        await blockChannel(key, name);
        div.remove();
      };
    }
    div.append(btn);
    host.prepend(div);
  }

  // ---------- 관찰 ----------
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document
        .querySelectorAll(CARD_SELECTOR)
        .forEach((c) => {
          // 유튜브는 카드 요소를 재사용하므로 제목이 바뀌면 다시 판정
          const sig = getTitle(c);
          if (c.dataset.ytafSig !== sig) {
            c.dataset.ytafSig = sig;
            process(c);
          }
        });
      applyShortsShelves();
      checkWatchPage();
      checkShortsPage();
    });
  }

  (async () => {
    await loadConfig();
    rescanAll();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    document.addEventListener("yt-navigate-finish", () => setTimeout(rescanAll, 300));
  })();
})();
