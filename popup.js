/* ═══════════════════════════════════════════════════════════════
   X Background Color Changer — Popup Logic
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_BG_COLOR = "#000000";
const DEFAULT_ACCENT_COLOR = "#1d9bf0";

const $ = (sel) => document.querySelector(sel);

const bgColorInput = $("#bgColor");
const hexDisplay = $("#hexDisplay");
const accentColorInput = $("#accentColor");
const accentDisplay = $("#accentDisplay");
const recentBgContainer = $("#recentBgColors");
const recentAccentContainer = $("#recentAccentColors");
const applyBtn = $("#applyBtn");
const resetBtn = $("#resetBtn");
const statusMsg = $("#statusMsg");

let recentBgColors = [];
let recentAccentColors = [];

// ── Helpers ──────────────────────────────────────────────

function showStatus(msg, type = "success") {
  statusMsg.textContent = msg;
  statusMsg.className = `status visible ${type}`;
  setTimeout(() => {
    statusMsg.classList.remove("visible");
  }, 2500);
}

function updateDisplays(bgColor, accentColor) {
  if (bgColor) hexDisplay.textContent = bgColor.toUpperCase();
  if (accentColor) accentDisplay.textContent = accentColor.toUpperCase();
}

function renderRecentColors(container, colorsArray, inputElem, isBg) {
  container.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    const color = colorsArray[i];

    if (color) {
      swatch.style.backgroundColor = color;
      swatch.title = `Aplicar ${color} al instante`;
      swatch.addEventListener("click", () => {
        // Update input and display
        inputElem.value = color;
        if (isBg) {
          updateDisplays(color, null);
        } else {
          updateDisplays(null, color);
        }

        // Auto-apply immediately without needing to click "Aplicar"
        applyBtn.click();
      });
    } else {
      swatch.style.backgroundColor = "#ffffff";
      swatch.title = "Vacío";
      swatch.style.cursor = "default";
    }

    container.appendChild(swatch);
  }
}

async function sendColorsToTab(bgColor, accentColor) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && (tab.url?.includes("x.com") || tab.url?.includes("twitter.com"))) {
      await chrome.tabs.sendMessage(tab.id, {
        action: "changeColors",
        bgColor: bgColor,
        accentColor: accentColor
      });
    }
  } catch (err) {
    console.log("Could not send message to tab:", err.message);
  }
}

// ── Init ─────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved colors and recent lists
  const result = await chrome.storage.local.get([
    "bgColor", "accentColor", "recentBgColors", "recentAccentColors"
  ]);
  const savedBg = result.bgColor || DEFAULT_BG_COLOR;
  const savedAccent = result.accentColor || DEFAULT_ACCENT_COLOR;

  recentBgColors = result.recentBgColors || [];
  recentAccentColors = result.recentAccentColors || [];

  bgColorInput.value = savedBg;
  accentColorInput.value = savedAccent;
  updateDisplays(savedBg, savedAccent);

  renderRecentColors(recentBgContainer, recentBgColors, bgColorInput, true);
  renderRecentColors(recentAccentContainer, recentAccentColors, accentColorInput, false);
});

// ── Live hex display updates ─────────────────────────────

bgColorInput.addEventListener("input", (e) => {
  updateDisplays(e.target.value, null);
});

accentColorInput.addEventListener("input", (e) => {
  updateDisplays(null, e.target.value);
});

// ── Apply button ─────────────────────────────────────────

applyBtn.addEventListener("click", async () => {
  const bg = bgColorInput.value;
  const accent = accentColorInput.value;

  // Update recent arrays (only if the color is completely new to the list)
  if (!recentBgColors.includes(bg)) {
    recentBgColors = [bg, ...recentBgColors].slice(0, 8);
  }

  if (!recentAccentColors.includes(accent)) {
    recentAccentColors = [accent, ...recentAccentColors].slice(0, 8);
  }

  // Save to storage
  await chrome.storage.local.set({
    bgColor: bg,
    accentColor: accent,
    recentBgColors: recentBgColors,
    recentAccentColors: recentAccentColors
  });

  renderRecentColors(recentBgContainer, recentBgColors, bgColorInput, true);
  renderRecentColors(recentAccentContainer, recentAccentColors, accentColorInput, false);

  // Send to active tab
  await sendColorsToTab(bg, accent);

  showStatus("✓ Colores aplicados", "success");
});

// ── Reset button ─────────────────────────────────────────

resetBtn.addEventListener("click", async () => {
  bgColorInput.value = DEFAULT_BG_COLOR;
  accentColorInput.value = DEFAULT_ACCENT_COLOR;
  updateDisplays(DEFAULT_BG_COLOR, DEFAULT_ACCENT_COLOR);

  recentBgColors = [];
  recentAccentColors = [];

  // Save defaults
  await chrome.storage.local.set({
    bgColor: DEFAULT_BG_COLOR,
    accentColor: DEFAULT_ACCENT_COLOR,
    recentBgColors: [],
    recentAccentColors: []
  });

  renderRecentColors(recentBgContainer, recentBgColors, bgColorInput, true);
  renderRecentColors(recentAccentContainer, recentAccentColors, accentColorInput, false);

  // Send to active tab
  await sendColorsToTab(DEFAULT_BG_COLOR, DEFAULT_ACCENT_COLOR);

  showStatus("↺ Colores restablecidos", "success");
});
