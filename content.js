/* ═══════════════════════════════════════════════════════════════
   X Background Color Changer — Content Script
   Injected into x.com / twitter.com
   ═══════════════════════════════════════════════════════════════ */

(() => {
  const STYLE_ID = "x-bg-color-changer-style";
  const DEFAULT_BG_COLOR = "#000000";

  const DEFAULT_ACCENT_COLOR = "#1d9bf0";

  /**
   * Inject or update the CSS stylesheet that overrides X.com backgrounds.
   * Uses broad selectors + known X.com structural selectors to cover
   * all background elements (main feed, sidebar, header, modals, etc.)
   */
  function applyColors(bgColor, accentColor) {
    let styleEl = document.getElementById(STYLE_ID);

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }

    // Build comprehensive CSS rules using variables for dynamic lightness
    styleEl.textContent = `
      :root {
        --user-bg: ${bgColor} !important;
        --user-btn-bg: ${accentColor} !important;
        --user-btn-hover: color-mix(in srgb, ${accentColor} 80%, #000000) !important;
      }

      /* ── Buttons (Post & Follow) ── */
      [data-testid="SideNav_NewTweet_Button"],
      [data-testid="tweetButtonInline"],
      [data-testid="tweetButton"],
      [data-testid$="-follow"],
      button[aria-label^="Seguir"],
      button[aria-label^="Follow"],
      [data-testid="UserCell"] [role="button"] {
        background-color: var(--user-btn-bg) !important;
        border-color: var(--user-btn-bg) !important;
      }
      
      /* Force the text inside these buttons to match the background color for maximum contrast */
      [data-testid="SideNav_NewTweet_Button"] *,
      [data-testid="tweetButtonInline"] *,
      [data-testid="tweetButton"] *,
      [data-testid$="-follow"] *,
      button[aria-label^="Seguir"] *,
      button[aria-label^="Follow"] *,
      [data-testid="UserCell"] [role="button"] * {
        color: var(--user-bg) !important;
      }

      [data-testid="SideNav_NewTweet_Button"]:hover,
      [data-testid="tweetButtonInline"]:hover,
      [data-testid="tweetButton"]:hover,
      [data-testid$="-follow"]:hover,
      button[aria-label^="Seguir"]:hover,
      button[aria-label^="Follow"]:hover,
      [data-testid="UserCell"] [role="button"]:hover {
        background-color: var(--user-btn-hover) !important;
        border-color: var(--user-btn-hover) !important;
      }

      /* ── Colored Text (Links, Mentions, Hashtags, "Mostrar más") ── */
      a,
      a * {
        /* Force links that have inline color to inherit the new accent */
        --link-color: var(--user-btn-bg);
      }
      
      /* Target typical Twitter blue/purple text elements */
      div[dir="auto"] > span > span,
      a[role="link"] > div > span,
      a[dir="ltr"] > span,
      [data-testid="trend"] > div > div:last-child,
      [data-testid="UserCell"] [dir="ltr"],
      /* "Mostrar más" typically uses these structures */
      a[href*="/i/related_users"] span,
      div[style*="color: rgb(29, 155, 240)"],
      div[style*="color: rgb(113, 118, 123)"],
      span[style*="color: rgb(29, 155, 240)"],
      span[style*="color: rgb(120, 86, 255)"],
      span[style*="color: #1d9bf0"] {
        color: var(--user-btn-bg) !important;
      }

      /* Native SVG Icons mimicking colored text */
      svg[style*="color: rgb(29, 155, 240)"],
      svg[style*="color: rgb(120, 86, 255)"] {
        color: var(--user-btn-bg) !important;
        fill: var(--user-btn-bg) !important;
      }

      /* ── Global body / html ── */
      html, body {
        background-color: var(--user-bg) !important;
      }

      /* ── Main app shell & structural containers ── */
      #react-root,
      #react-root > div,
      #react-root > div > div,
      #react-root > div > div > div,
      #react-root > div > div > div > main,
      #react-root > div > div > div > header,
      [data-testid="primaryColumn"],
      [data-testid="sidebarColumn"],
      main,
      header[role="banner"],
      nav[role="navigation"],
      [role="complementary"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Timeline & tweet containers ── */
      [data-testid="cellInnerDiv"],
      [data-testid="tweet"],
      [data-testid="tweetDetail"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Quoted tweets ── */
      [data-testid="card.wrapper"],
      [data-testid="tweetQuote"],
      article[data-testid="tweet"] div[role="link"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Tab bars & navigation elements ── */
      [role="tablist"],
      [data-testid="ScrollSnap-List"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Search bar — full chain ── */
      [data-testid="SearchBox_Search_Input_Container"],
      [data-testid="sidebarColumn"] > div,
      [data-testid="sidebarColumn"] > div > div,
      [data-testid="sidebarColumn"] > div > div > div,
      [data-testid="SearchBox_Search_Input"],
      [data-testid="SearchBox_Search_Input_label"],
      form[role="search"],
      form[role="search"] > div,
      form[role="search"] > div > div,
      form[role="search"] div[style*="background-color"],
      form[role="search"] input {
        background-color: var(--user-bg) !important;
      }

      /* ── Tweet compose box — full chain ── */
      [data-testid="tweetTextarea_0"],
      [data-testid="tweetTextarea_0_label"],
      [data-testid="tweetTextarea_0_Wrapper"],
      [data-testid="tweetTextarea_0_Wrapper"] > div,
      [data-testid="tweetTextarea_0_Wrapper"] > div > div,
      [data-testid="toolBar"],
      .DraftEditor-root,
      .public-DraftEditor-content,
      .public-DraftEditorPlaceholder-root,
      [data-testid="primaryColumn"] [role="textbox"],
      [data-testid="primaryColumn"] > div > div:nth-child(1) div[style*="background"],
      [data-testid="primaryColumn"] > div > div:nth-child(2) div[style*="background"],
      [data-testid="primaryColumn"] > div > div:nth-child(3) div[style*="background"],
      [data-testid="primaryColumn"] > div > div:nth-child(1),
      [data-testid="primaryColumn"] > div > div:nth-child(2),
      [data-testid="primaryColumn"] > div > div:nth-child(3) {
        background-color: var(--user-bg) !important;
      }

      /* ── Sidebar cards (Premium, Trending, Who to follow) ── */
      [data-testid="sidebarColumn"] aside,
      [data-testid="sidebarColumn"] section,
      [data-testid="sidebarColumn"] [role="region"],
      [data-testid="sidebarColumn"] [data-testid="trend"],
      [data-testid="sidebarColumn"] a[role="link"],
      [role="complementary"] > div,
      [role="complementary"] > div > div,
      [role="complementary"] > div > div > div,
      [role="complementary"] section,
      [role="complementary"] aside {
        background-color: var(--user-bg) !important;
      }

      /* ── Bottom bar (mobile-like nav) ── */
      [data-testid="BottomBar"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Modals / dialogs / dropdown menus ── */
      [data-testid="sheetDialog"],
      [role="dialog"],
      [data-testid="Dropdown"],
      [data-testid="mask"],
      div[style*="background-color: rgba(0, 0, 0, 0.4)"] {
        background-color: var(--user-bg) !important;
      }

      /* ── DM drawer ── */
      [data-testid="DMDrawer"],
      [data-testid="DMDrawerHeader"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Sticky header ── */
      div[data-testid="primaryColumn"] > div > div:first-child {
        background-color: var(--user-bg) !important;
      }

      /* ── Compose Box Inner Editor ── */
      /* Targets the specific inner div of the DraftEditor that holds the background */
      [data-testid="tweetTextarea_0_Wrapper"] .DraftEditor-root,
      [data-testid="tweetTextarea_0_Wrapper"] .DraftEditor-root > div,
      [data-testid="tweetTextarea_0_Wrapper"] [data-offset-key],
      .public-DraftEditor-content,
      .public-DraftStyleDefault-block,
      div.DraftEditor-root,
      div.DraftEditor-editorContainer,
      div.public-DraftEditor-content {
          background-color: var(--user-bg) !important;
      }

      /* ── Catch-all: any div with inline X.com dark/light theme background-color ── */
      div[style*="background-color: rgb(0, 0, 0)"],
      div[style*="background-color: rgb(21, 32, 43)"],
      div[style*="background-color: rgb(22, 24, 28)"],
      div[style*="background-color: rgb(25, 39, 52)"],
      div[style*="background-color: rgb(30, 39, 50)"],
      div[style*="background-color: rgb(32, 35, 39)"],
      div[style*="background-color: rgb(39, 44, 48)"],
      div[style*="background-color: rgb(239, 243, 244)"],
      div[style*="background-color: rgb(247, 249, 249)"],
      div[style*="background-color: rgb(255, 255, 255)"],
      div[style*="background-color:#000"],
      div[style*="background-color: #000"],
      span[style*="background-color: rgb(0, 0, 0)"],
      span[style*="background-color: rgb(21, 32, 43)"] {
        background-color: var(--user-bg) !important;
      }
    `;

    // Also scan DOM for elements with inline background-color and override them
    scanAndOverrideInlineBackgrounds(color);
  }

  /**
   * Scan all visible elements for inline background-color styles,
   * text colors, and SVG fills, and override them if they match default Twitter colors.
   */
  function scanAndOverrideInlineBackgrounds() {
    const bgColorsToOverride = new Set([
      "rgb(0, 0, 0)",
      "rgb(21, 32, 43)",
      "rgb(22, 24, 28)",
      "rgb(25, 39, 52)",
      "rgb(30, 39, 50)",
      "rgb(32, 35, 39)",
      "rgb(39, 44, 48)",
      "rgb(239, 243, 244)",
      "rgb(247, 249, 249)",
      "rgb(255, 255, 255)",
    ]);

    const textColorsToOverride = new Set([
      "rgb(29, 155, 240)", // Twitter Blue
      "rgb(120, 86, 255)", // Twitter Purple (Premium)
      "#1d9bf0",
      "#7856ff"
    ]);

    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (el.id === STYLE_ID) continue;

      // 1. Handle Background Colors
      const role = el.getAttribute("role");
      const testid = el.getAttribute("data-testid") || "";
      const isButton = el.tagName === "BUTTON" || role === "button" || testid.toLowerCase().includes("button");

      if (!isButton) {
        const bg = el.style.backgroundColor;
        if (bg && bgColorsToOverride.has(bg)) {
          el.style.setProperty("background-color", "var(--user-bg)", "important");
        }
      }

      // 2. Handle Text Colors (Skip inputs/textareas to be safe, but target spans/divs/a)
      const color = el.style.color;
      if (color && textColorsToOverride.has(color) && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
        el.style.setProperty("color", "var(--user-btn-bg)", "important");
      }

      // 3. Handle SVG Fills
      if (el.tagName === "svg" || el.tagName === "path") {
        const fill = el.style.fill;
        if (fill && textColorsToOverride.has(fill)) {
          el.style.setProperty("fill", "var(--user-btn-bg)", "important");
        }
        if (color && textColorsToOverride.has(color)) {
          el.style.setProperty("color", "var(--user-btn-bg)", "important");
        }
      }
    }
  }

  /**
   * Remove the injected style (restore original X.com appearance)
   */
  function removeBackgroundColor() {
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
      styleEl.remove();
    }
  }

  // ── Listen for messages from popup ─────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "changeColors") {
      if (message.bgColor === DEFAULT_BG_COLOR && message.accentColor === DEFAULT_ACCENT_COLOR) {
        removeBackgroundColor();
      } else {
        applyColors(message.bgColor, message.accentColor);
      }
      sendResponse({ success: true });
    }
    return true; // Keep message channel open for async
  });

  // ── Apply saved colors on page load ─────────────────────

  async function init() {
    try {
      const result = await chrome.storage.local.get(["bgColor", "accentColor"]);
      const savedBg = result.bgColor || DEFAULT_BG_COLOR;
      const savedAccent = result.accentColor || DEFAULT_ACCENT_COLOR;

      if (savedBg !== DEFAULT_BG_COLOR || savedAccent !== DEFAULT_ACCENT_COLOR) {
        // Wait for DOM to be ready
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            applyColors(savedBg, savedAccent);
          });
        } else {
          applyColors(savedBg, savedAccent);
        }

        // Re-apply when X.com dynamically updates the DOM
        let scanTimeout = null;
        const observer = new MutationObserver(() => {
          const styleEl = document.getElementById(STYLE_ID);
          if (!styleEl || !document.contains(styleEl)) {
            applyColors(savedBg, savedAccent);
          }
          // Debounced scan for new elements with inline bg colors
          if (scanTimeout) clearTimeout(scanTimeout);
          scanTimeout = setTimeout(() => {
            scanAndOverrideInlineBackgrounds(savedBg);
          }, 300);
        });

        // Start observing once body exists
        const startObserver = () => {
          if (document.body) {
            observer.observe(document.body, {
              childList: true,
              subtree: true,
            });
          } else {
            document.addEventListener("DOMContentLoaded", () => {
              observer.observe(document.body, {
                childList: true,
                subtree: true,
              });
            });
          }
        };

        startObserver();
      }
    } catch (err) {
      console.log("X Background Color Changer: init error", err.message);
    }
  }

  // ── Listen for storage changes (when color is changed from another tab) ──

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && (changes.bgColor || changes.accentColor)) {
      const result = await chrome.storage.local.get(["bgColor", "accentColor"]);
      const newBg = result.bgColor || DEFAULT_BG_COLOR;
      const newAccent = result.accentColor || DEFAULT_ACCENT_COLOR;

      if (newBg !== DEFAULT_BG_COLOR || newAccent !== DEFAULT_ACCENT_COLOR) {
        applyColors(newBg, newAccent);
      } else {
        removeBackgroundColor();
      }
    }
  });

  init();
})();
