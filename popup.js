/* ═══════════════════════════════════════════════════════════════
   X Background Color Changer v2 — Popup Logic
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_BG_COLOR = "#000000";
const DEFAULT_ACCENT_COLOR = "#1d9bf0";

const $ = (sel) => document.querySelector(sel);

const bgColorInput = $("#bgColor");
const hexDisplay = $("#hexDisplay");
const accentColorInput = $("#accentColor");
const accentDisplay = $("#accentDisplay");
const surfaceReliefInput = $("#surfaceRelief");
const recentBgContainer = $("#recentBgColors");
const recentAccentContainer = $("#recentAccentColors");
const applyBtn = $("#applyBtn");
const resetBtn = $("#resetBtn");
const statusMsg = $("#statusMsg");

let recentBgColors = [];
let recentAccentColors = [];
let statusTimer = null;

// ── Helpers ──────────────────────────────────────────────────────

function showStatus(msg, type = "success") {
  statusMsg.textContent = msg;
  statusMsg.className = `status visible ${type}`;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusMsg.classList.remove("visible");
  }, 2500);
}

function normalizeHex(raw) {
  if (!raw) return null;
  let v = raw.trim();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    v = "#" + v.slice(1).split("").map((c) => c + c).join("");
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    return v.toLowerCase();
  }
  return null;
}

function updateDisplays(bgColor, accentColor) {
  if (bgColor) hexDisplay.value = bgColor.toUpperCase();
  if (accentColor) accentDisplay.value = accentColor.toUpperCase();
}

function renderRecentColors(container, colorsArray, inputElem, isBg) {
  container.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const swatch = document.createElement("div");
    const color = colorsArray[i];

    if (color) {
      swatch.className = "color-swatch filled";
      swatch.style.backgroundColor = color;
      swatch.title = `Aplicar ${color.toUpperCase()} al instante`;
      swatch.addEventListener("click", () => {
        inputElem.value = color;
        if (isBg) {
          updateDisplays(color, null);
        } else {
          updateDisplays(null, color);
        }
        applyBtn.click();
      });
    } else {
      swatch.className = "color-swatch empty";
      swatch.title = "Vacío";
    }

    container.appendChild(swatch);
  }
}

async function broadcastToXTabs(payload) {
  try {
    const allXTabs = await chrome.tabs.query({
      url: [
        "*://x.com/*",
        "*://*.x.com/*",
        "*://twitter.com/*",
        "*://*.twitter.com/*"
      ]
    });

    for (const tab of allXTabs) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.sendMessage(tab.id, payload);
      } catch {
        // Content script not yet loaded in an older tab — inject on the fly
        try {
          if (chrome.scripting) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content.js"]
            });
            await chrome.tabs.sendMessage(tab.id, payload);
          }
        } catch (injectionErr) {
          console.warn("Could not inject content script:", injectionErr.message);
        }
      }
    }
  } catch (err) {
    console.warn("Could not broadcast to X tabs:", err.message);
  }
}

// ── Init ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const result = await chrome.storage.local.get([
    "bgColor",
    "accentColor",
    "surfaceRelief",
    "recentBgColors",
    "recentAccentColors"
  ]);

  const savedBg = result.bgColor || DEFAULT_BG_COLOR;
  const savedAccent = result.accentColor || DEFAULT_ACCENT_COLOR;
  const savedRelief = result.surfaceRelief !== false;

  recentBgColors = result.recentBgColors || [];
  recentAccentColors = result.recentAccentColors || [];

  bgColorInput.value = savedBg;
  accentColorInput.value = savedAccent;
  surfaceReliefInput.checked = savedRelief;
  updateDisplays(savedBg, savedAccent);

  renderRecentColors(recentBgContainer, recentBgColors, bgColorInput, true);
  renderRecentColors(recentAccentContainer, recentAccentColors, accentColorInput, false);
});

// ── Picker & Editable Hex Inputs ─────────────────────────────────

bgColorInput.addEventListener("input", (e) => {
  updateDisplays(e.target.value, null);
});

accentColorInput.addEventListener("input", (e) => {
  updateDisplays(null, e.target.value);
});

hexDisplay.addEventListener("input", (e) => {
  const valid = normalizeHex(e.target.value);
  if (valid) bgColorInput.value = valid;
});

hexDisplay.addEventListener("blur", () => {
  const valid = normalizeHex(hexDisplay.value);
  hexDisplay.value = (valid || bgColorInput.value).toUpperCase();
});

accentDisplay.addEventListener("input", (e) => {
  const valid = normalizeHex(e.target.value);
  if (valid) accentColorInput.value = valid;
});

accentDisplay.addEventListener("blur", () => {
  const valid = normalizeHex(accentDisplay.value);
  accentDisplay.value = (valid || accentColorInput.value).toUpperCase();
});

surfaceReliefInput.addEventListener("change", async () => {
  const data = await chrome.storage.local.get(["enabled"]);
  if (data.enabled) {
    applyBtn.click();
  }
});

// ── Apply Button ─────────────────────────────────────────────────

applyBtn.addEventListener("click", async () => {
  const bg = normalizeHex(hexDisplay.value) || bgColorInput.value;
  const accent = normalizeHex(accentDisplay.value) || accentColorInput.value;
  const surfaceRelief = surfaceReliefInput.checked;

  bgColorInput.value = bg;
  accentColorInput.value = accent;
  updateDisplays(bg, accent);

  if (!recentBgColors.includes(bg)) {
    recentBgColors = [bg, ...recentBgColors].slice(0, 8);
  }
  if (!recentAccentColors.includes(accent)) {
    recentAccentColors = [accent, ...recentAccentColors].slice(0, 8);
  }

  await chrome.storage.local.set({
    enabled: true,
    bgColor: bg,
    accentColor: accent,
    surfaceRelief: surfaceRelief,
    recentBgColors: recentBgColors,
    recentAccentColors: recentAccentColors
  });

  renderRecentColors(recentBgContainer, recentBgColors, bgColorInput, true);
  renderRecentColors(recentAccentContainer, recentAccentColors, accentColorInput, false);

  await broadcastToXTabs({
    action: "changeColors",
    bgColor: bg,
    accentColor: accent,
    surfaceRelief: surfaceRelief
  });

  showStatus("✓ Colores aplicados", "success");
});

// ── Reset Button ─────────────────────────────────────────────────

resetBtn.addEventListener("click", async () => {
  bgColorInput.value = DEFAULT_BG_COLOR;
  accentColorInput.value = DEFAULT_ACCENT_COLOR;
  surfaceReliefInput.checked = true;
  updateDisplays(DEFAULT_BG_COLOR, DEFAULT_ACCENT_COLOR);

  await chrome.storage.local.set({
    enabled: false,
    bgColor: DEFAULT_BG_COLOR,
    accentColor: DEFAULT_ACCENT_COLOR,
    surfaceRelief: true
  });

  await broadcastToXTabs({ action: "resetColors" });

  showStatus("↺ Colores originales restaurados", "success");
});
