const $ = (id) => document.getElementById(id);

async function getCfg() {
  return { ...YTAF_DEFAULTS, ...(await chrome.storage.local.get(YTAF_DEFAULTS)) };
}

function renderList(el, map, onRemove) {
  el.innerHTML = "";
  const entries = Object.entries(map);
  if (!entries.length) {
    el.innerHTML = '<li class="empty">없음</li>';
    return;
  }
  for (const [key, name] of entries.sort((a, b) => a[1].localeCompare(b[1]))) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = name && name !== key ? `${name} (${key})` : key;
    span.title = key;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "목록에서 제거";
    btn.onclick = () => onRemove(key);
    li.append(span, btn);
    el.append(li);
  }
}

async function render() {
  const cfg = await getCfg();
  $("enabled").checked = cfg.enabled;
  $("mode").value = cfg.mode;
  $("autoBlockLabeled").checked = cfg.autoBlockLabeled;
  $("autoBlockTts").checked = cfg.autoBlockTts;
  $("showBlockButton").checked = cfg.showBlockButton;
  $("shortsAutoSkip").checked = cfg.shortsAutoSkip;
  $("hideAllShorts").checked = cfg.hideAllShorts;
  $("keywords").value = cfg.keywords.join("\n");
  $("blockedCount").textContent = `(${Object.keys(cfg.blockedChannels).length})`;

  renderList($("blocked"), cfg.blockedChannels, async (key) => {
    const c = await getCfg();
    delete c.blockedChannels[key];
    await chrome.storage.local.set({ blockedChannels: c.blockedChannels });
  });
  renderList($("allowed"), cfg.allowedChannels, async (key) => {
    const c = await getCfg();
    delete c.allowedChannels[key];
    await chrome.storage.local.set({ allowedChannels: c.allowedChannels });
  });

  const { filteredCount = 0 } = await chrome.storage.local.get("filteredCount");
  $("count").textContent = filteredCount.toLocaleString();
}

for (const id of ["enabled", "autoBlockLabeled", "autoBlockTts", "showBlockButton", "shortsAutoSkip", "hideAllShorts"]) {
  $(id).addEventListener("change", (e) => chrome.storage.local.set({ [id]: e.target.checked }));
}
$("mode").addEventListener("change", (e) => chrome.storage.local.set({ mode: e.target.value }));

$("saveKeywords").addEventListener("click", async () => {
  const keywords = $("keywords").value.split("\n").map((s) => s.trim()).filter(Boolean);
  await chrome.storage.local.set({ keywords });
  $("saveKeywords").textContent = "저장됨 ✓";
  setTimeout(() => ($("saveKeywords").textContent = "키워드 저장"), 1200);
});

$("export").addEventListener("click", async () => {
  const { blockedChannels, allowedChannels, keywords } = await getCfg();
  const blob = new Blob([JSON.stringify({ blockedChannels, allowedChannels, keywords }, null, 2)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "yt-ai-filter-lists.json";
  a.click();
});

$("import").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const cfg = await getCfg();
    await chrome.storage.local.set({
      blockedChannels: { ...cfg.blockedChannels, ...(data.blockedChannels || {}) },
      allowedChannels: { ...cfg.allowedChannels, ...(data.allowedChannels || {}) },
      keywords: [...new Set([...cfg.keywords, ...(data.keywords || [])])]
    });
  } catch {
    alert("JSON 파일을 읽지 못했습니다.");
  }
});

chrome.storage.onChanged.addListener(render);
render();
