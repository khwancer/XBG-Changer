/* ═══════════════════════════════════════════════════════════════════
   X Background Color Changer v2 — Content Script
   Injected into x.com / twitter.com at document_start
   3-Layer Theme Engine:
     1. CSSOM Atomic Class Mirroring (React Native Web stylesheets)
     2. Structural & Semantic Selectors (Buttons, Sticky Bars, Modals, SVGs)
     3. Reversible DOM Attribute Scanner (Inline styles, SVGs & dynamic nodes)
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  if (window.__xBgChangerV2Loaded) return;
  window.__xBgChangerV2Loaded = true;

  const STYLE_ID = "x-bg-color-changer-style";
  const ATOMIC_STYLE_ID = "x-bg-color-changer-atomic";

  const DEFAULT_BG_COLOR = "#000000";
  const DEFAULT_ACCENT_COLOR = "#1d9bf0";

  let state = {
    enabled: false,
    bg: DEFAULT_BG_COLOR,
    accent: DEFAULT_ACCENT_COLOR,
    surfaceRelief: true
  };

  // Track processed rule count per CSSStyleSheet; rescan full sheet when length changes
  // because React Native Web's OrderedCSSStyleSheet inserts new rules at middle indices!
  let sheetRuleCounts = new WeakMap();
  let atomicBgAndTextRules = [];
  let atomicAccentRules = [];
  let seenAtomicRuleKeys = new Set();
  let pureAtomicBgClasses = new Set();
  let pureAtomicAccentBgClasses = new Set();
  let pureAtomicFgClasses = new Set();

  // Native X accent RGBs ("r,g,b"). Starts with Twitter/X Blues & Premium Purple,
  // and expands if the user configured a custom X theme accent (Yellow, Orange, etc.)
  const accentRgbSet = new Set([
    "29,155,240",  // Default X Blue (#1d9bf0)
    "29,161,242",  // Legacy Twitter Blue (#1da1f2)
    "74,153,233",  // Secondary link Blue (#4a99e9)
    "120,86,255"   // X Purple (#7856ff)
  ]);
  const accentHoverRgbSet = new Set([
    "26,140,216",  // Hover X Blue (#1a8cd8)
    "23,124,192",
    "108,77,230"
  ]);

  // Primary page background RGBs across Lights Out, Dim & Light themes
  const primaryBgRgbSet = new Set([
    "0,0,0",       // Lights Out (#000000)
    "21,32,43",    // Dim (#15202b)
    "255,255,255", // Light (#ffffff)
    "8,8,8",
    "10,10,10",
    "12,14,17",
    "15,17,20"
  ]);

  // Secondary / elevated surface RGBs (cards, search bar, Grok, DMs, menus, hover boxes)
  const elevatedBgRgbSet = new Set([
    "22,24,28",    // #16181c (Dark sidebar cards)
    "24,24,24",
    "26,26,26",
    "18,20,23",
    "20,23,26",
    "29,31,35",
    "32,35,39",    // #202327 (Dark search input / pills)
    "39,44,48",    // #272c30
    "25,39,52",    // #192734 (Dim cards)
    "30,39,50",    // #1e2732 (Dim inputs)
    "39,51,64",    // #273340 (Dim search / hover)
    "23,35,47",
    "247,249,249", // #f7f9f9 (Light cards)
    "239,243,244", // #eff3f4 (Light search / pills)
    "231,233,234"  // #e7e9ea (Light chips / subtle cards)
  ]);

  // Default primary text RGBs (used to ensure legibility if user mixes light/dark modes)
  const primaryTextRgbSet = new Set([
    "231,233,234", // #e7e9ea (Dark/Dim primary text)
    "247,249,249",
    "15,20,25"     // #0f1419 (Light primary text)
  ]);

  // Default divider / border RGBs
  const borderRgbSet = new Set([
    "47,51,54",    // #2f3336 (Lights Out border)
    "56,68,77",    // #38444d (Dim border)
    "239,243,244", // #eff3f4 (Light subtle border)
    "207,217,222"  // #cfd9de (Light input border)
  ]);

  // Wrapped in :where() so exclusions add (0,0,0) specificity and never overpower accent rules
  const NOT_CTA_OR_MEDIA =
    ':where(' +
    ':not([data-testid="SideNav_NewTweet_Button"])' +
    ':not([data-testid="tweetButton"])' +
    ':not([data-testid="tweetButtonInline"])' +
    ':not([data-testid$="-follow"])' +
    ':not([data-testid="Profile_Save_Button"])' +
    ':not([data-testid="confirmationSheetConfirm"])' +
    ':not([data-testid="pillLabel"])' +
    ':not([data-testid="mask"])' +
    ':not([data-testid="videoPlayer"] *)' +
    ':not([data-xbg-cta])' +
    ')';

  // ── Color Math & Parsing Helpers ─────────────────────────────────────────

  function hexToRgb(hex) {
    const clean = (hex || "#000000").replace("#", "").trim();
    const full = clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0");
    const num = parseInt(full, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function getRelativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const toLinear = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  function parseCssColor(str) {
    if (!str) return null;
    const v = str.trim().toLowerCase();
    if (!v || v === "transparent" || v === "inherit" || v === "initial" || v === "currentcolor" || v.startsWith("var(")) {
      return null;
    }

    if (v.startsWith("rgb")) {
      const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(v);
      if (!m) return null;
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] !== undefined ? Number(m[4]) : 1
      };
    }

    if (v.startsWith("#")) {
      if (v.length === 4 || v.length === 7) {
        const { r, g, b } = hexToRgb(v);
        return { r, g, b, a: 1 };
      }
    }

    return null;
  }

  function classifyBgColor(parsed) {
    if (!parsed || parsed.a === 0) return null;
    const key = `${parsed.r},${parsed.g},${parsed.b}`;

    if (accentRgbSet.has(key)) {
      if (parsed.a === 1) return "accent";
      if (parsed.a > 0 && parsed.a <= 0.35) return "accent-tint";
    }
    if (accentHoverRgbSet.has(key) && parsed.a === 1) {
      return "accent-hover";
    }

    if (parsed.a === 1) {
      if (primaryBgRgbSet.has(key)) return "bg";
      if (elevatedBgRgbSet.has(key)) return "elevated";
    } else if (parsed.a >= 0.6 && parsed.a < 1) {
      // Sticky headers & floating translucent bars (skips 0.4 modal masks)
      if (primaryBgRgbSet.has(key) || elevatedBgRgbSet.has(key) || key === "15,20,25") {
        return "translucent";
      }
    }

    return null;
  }

  function classifyAccentColor(parsed) {
    if (!parsed || parsed.a < 0.7) return false;
    const key = `${parsed.r},${parsed.g},${parsed.b}`;
    return accentRgbSet.has(key) || accentHoverRgbSet.has(key);
  }

  // Detect if user selected Yellow, Orange, Pink or Green in X's native Display settings
  let nativeAccentChecked = false;
  function detectNativeXAccent() {
    if (nativeAccentChecked) return;
    const btn = document.querySelector('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"]');
    if (!btn) return;

    nativeAccentChecked = true;
    // Read before our styles apply, or temporarily inspect inline/underlying classes
    const styleEl = document.getElementById(STYLE_ID);
    const atomicEl = document.getElementById(ATOMIC_STYLE_ID);
    const prevDisabled1 = styleEl ? styleEl.disabled : false;
    const prevDisabled2 = atomicEl ? atomicEl.disabled : false;
    if (styleEl) styleEl.disabled = true;
    if (atomicEl) atomicEl.disabled = true;

    const computedBg = window.getComputedStyle(btn).backgroundColor;

    if (styleEl) styleEl.disabled = prevDisabled1;
    if (atomicEl) atomicEl.disabled = prevDisabled2;

    const parsed = parseCssColor(computedBg);
    if (parsed && parsed.a === 1) {
      const key = `${parsed.r},${parsed.g},${parsed.b}`;
      // Ignore white/black monochrome buttons; capture colored native themes (Yellow, Orange, etc.)
      if (!primaryBgRgbSet.has(key) && !elevatedBgRgbSet.has(key) && key !== "15,20,25" && !accentRgbSet.has(key)) {
        accentRgbSet.add(key);
        // Reset sheet cache so newly recognized native accent classes get mirrored
        sheetRuleCounts = new WeakMap();
        atomicBgAndTextRules = [];
        atomicAccentRules = [];
        seenAtomicRuleKeys.clear();
        pureAtomicBgClasses.clear();
        pureAtomicAccentBgClasses.clear();
        pureAtomicFgClasses.clear();
      }
    }
  }

  // ── Layer 1: CSSOM Atomic Stylesheet Mirroring ───────────────────────────

  function wrapSelector(selectorText, withExclusions = false, highPriority = false) {
    if (!selectorText) return null;
    if (selectorText.includes("::")) {
      return selectorText;
    }
    const prefix = highPriority ? "html body " : "";
    return withExclusions
      ? `${prefix}:is(${selectorText})${NOT_CTA_OR_MEDIA}`
      : `${prefix}:is(${selectorText})`;
  }

  // Only record single pure atomic classes (e.g. ".r-1cvl2hr"), NEVER base RNW classes ("css-*")
  // or compound selectors, so Layer 3 fallback is never mistakenly skipped.
  function recordPureAtomicClass(selectorText, targetSet) {
    const m = /^\.(r-[a-zA-Z0-9_-]+)$/.exec(selectorText.trim());
    if (m) {
      targetSet.add(m[1]);
    }
  }

  function hasHandledClass(el, targetSet) {
    const cls = el.classList;
    if (!cls || cls.length === 0) return false;
    for (let i = 0; i < cls.length; i++) {
      if (targetSet.has(cls[i])) return true;
    }
    return false;
  }

  function inspectCssRule(rule) {
    if (!rule) return;

    // Recurse into @media / @supports group rules
    if (rule.cssRules && rule.cssRules.length) {
      for (let i = 0; i < rule.cssRules.length; i++) {
        inspectCssRule(rule.cssRules[i]);
      }
      return;
    }

    if (!rule.style || !rule.selectorText) return;
    const sel = rule.selectorText;
    const hasPseudoElement = sel.includes("::");
    const st = rule.style;

    // 1. Background colors
    const bgVal = st.backgroundColor;
    if (bgVal) {
      const bgKind = classifyBgColor(parseCssColor(bgVal));
      if (bgKind) {
        const key = `bg|${bgKind}|${sel}`;
        if (bgKind === "accent" || bgKind === "accent-hover" || bgKind === "accent-tint") {
          recordPureAtomicClass(sel, pureAtomicAccentBgClasses);
        } else {
          recordPureAtomicClass(sel, pureAtomicBgClasses);
        }

        if (!seenAtomicRuleKeys.has(key)) {
          seenAtomicRuleKeys.add(key);
          if (bgKind === "bg") {
            atomicBgAndTextRules.push(`${wrapSelector(sel, true, false)} { background-color: var(--user-bg) !important; }`);
          } else if (bgKind === "elevated") {
            atomicBgAndTextRules.push(`${wrapSelector(sel, true, false)} { background-color: var(--user-surface) !important; }`);
          } else if (bgKind === "translucent") {
            atomicBgAndTextRules.push(`${wrapSelector(sel, true, false)} { background-color: var(--user-bg-translucent) !important; }`);
          } else if (bgKind === "accent") {
            atomicAccentRules.push(`${wrapSelector(sel, false, true)} { background-color: var(--user-btn-bg) !important; color: var(--user-btn-fg) !important; }`);
          } else if (bgKind === "accent-hover") {
            atomicAccentRules.push(`${wrapSelector(sel, false, true)} { background-color: var(--user-btn-hover) !important; }`);
          } else if (bgKind === "accent-tint") {
            atomicAccentRules.push(`${wrapSelector(sel, false, true)} { background-color: var(--user-accent-tint) !important; }`);
          }
        }
      }
    }

    // 2. Text / foreground colors
    const colorVal = st.color;
    if (colorVal) {
      const parsedColor = parseCssColor(colorVal);
      if (parsedColor) {
        const cKey = `${parsedColor.r},${parsedColor.g},${parsedColor.b}`;
        const ctaChildExclusion = hasPseudoElement ? "" : ":where(:not([data-xbg-cta] *))";
        if (classifyAccentColor(parsedColor)) {
          recordPureAtomicClass(sel, pureAtomicFgClasses);
          const key = `fg|accent|${sel}`;
          if (!seenAtomicRuleKeys.has(key)) {
            seenAtomicRuleKeys.add(key);
            atomicAccentRules.push(
              `${wrapSelector(sel, false, true)}${ctaChildExclusion} { color: var(--user-btn-bg) !important; }`
            );
            if (!hasPseudoElement) {
              // Ensure any nested spans inside "Show more" / "Mostrar más posts" also get the accent color
              atomicAccentRules.push(
                `${wrapSelector(sel, false, true)}${ctaChildExclusion} span { color: var(--user-btn-bg) !important; }`
              );
            }
          }
        } else if (parsedColor.a === 1 && primaryTextRgbSet.has(cKey)) {
          const key = `fg|primary|${sel}`;
          if (!seenAtomicRuleKeys.has(key)) {
            seenAtomicRuleKeys.add(key);
            atomicBgAndTextRules.push(
              `${wrapSelector(sel, true, false)}${ctaChildExclusion} { color: var(--user-fg) !important; }`
            );
          }
        }
      }
    }

    // 3. Borders & outlines (active search bar, focus rings, dividers)
    const borderProps = st.borderColor
      ? [["borderColor", "border-color"], ["outlineColor", "outline-color"]]
      : [
          ["borderTopColor", "border-top-color"],
          ["borderBottomColor", "border-bottom-color"],
          ["borderLeftColor", "border-left-color"],
          ["borderRightColor", "border-right-color"],
          ["outlineColor", "outline-color"]
        ];

    for (const [jsProp, cssProp] of borderProps) {
      const val = st[jsProp];
      if (!val) continue;
      const parsed = parseCssColor(val);
      if (!parsed) continue;
      const rgbKey = `${parsed.r},${parsed.g},${parsed.b}`;

      if (classifyAccentColor(parsed)) {
        const key = `${cssProp}|accent|${sel}`;
        if (!seenAtomicRuleKeys.has(key)) {
          seenAtomicRuleKeys.add(key);
          atomicAccentRules.push(`${wrapSelector(sel, false, true)} { ${cssProp}: var(--user-btn-bg) !important; }`);
        }
      } else if (parsed.a === 1 && borderRgbSet.has(rgbKey)) {
        const key = `${cssProp}|border|${sel}`;
        if (!seenAtomicRuleKeys.has(key)) {
          seenAtomicRuleKeys.add(key);
          atomicBgAndTextRules.push(`${wrapSelector(sel, true, false)} { ${cssProp}: var(--user-border) !important; }`);
        }
      }
    }

    // 4. SVG fill / stroke in stylesheets
    if (st.fill && classifyAccentColor(parseCssColor(st.fill))) {
      const key = `fill|accent|${sel}`;
      if (!seenAtomicRuleKeys.has(key)) {
        seenAtomicRuleKeys.add(key);
        atomicAccentRules.push(`${wrapSelector(sel, false, true)} { fill: var(--user-btn-bg) !important; }`);
      }
    }
  }

  function syncAtomicStylesheets(forceWrite = false) {
    if (!state.enabled) return;

    let addedAny = forceWrite;
    const sheets = document.styleSheets;

    for (let s = 0; s < sheets.length; s++) {
      const sheet = sheets[s];
      const ownerNode = sheet.ownerNode;
      if (ownerNode && (ownerNode.id === STYLE_ID || ownerNode.id === ATOMIC_STYLE_ID)) {
        continue;
      }

      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        // Cross-origin stylesheet; handled by Layer 2 & Layer 3
        continue;
      }
      if (!rules) continue;

      const prevCount = sheetRuleCounts.get(sheet);
      if (prevCount === rules.length) continue;

      const prevTotal = atomicBgAndTextRules.length + atomicAccentRules.length;
      // Scan from 0 because OrderedCSSStyleSheet inserts new atomic rules at middle indices
      for (let i = 0; i < rules.length; i++) {
        inspectCssRule(rules[i]);
      }
      sheetRuleCounts.set(sheet, rules.length);

      if (atomicBgAndTextRules.length + atomicAccentRules.length > prevTotal) {
        addedAny = true;
      }
    }

    let atomicEl = document.getElementById(ATOMIC_STYLE_ID);
    if (!atomicEl) {
      atomicEl = document.createElement("style");
      atomicEl.id = ATOMIC_STYLE_ID;
      const mainStyle = document.getElementById(STYLE_ID);
      const parent = document.head || document.documentElement;
      if (mainStyle && mainStyle.parentNode === parent) {
        parent.insertBefore(atomicEl, mainStyle);
      } else {
        parent.appendChild(atomicEl);
      }
      addedAny = true;
    }

    if (addedAny) {
      atomicEl.textContent = atomicBgAndTextRules.concat(atomicAccentRules).join("\n");
    }
  }

  // ── Layer 2: Structural & Semantic CSS ───────────────────────────────────

  function buildStructuralCss(bgColor, accentColor, surfaceRelief) {
    const isDarkBg = getRelativeLuminance(bgColor) < 0.42;
    const isLightAccent = getRelativeLuminance(accentColor) > 0.45;

    const surfaceExpr = surfaceRelief
      ? `color-mix(in srgb, ${bgColor} 93%, ${isDarkBg ? "#ffffff" : "#000000"})`
      : bgColor;

    const hoverExpr = `color-mix(in srgb, ${bgColor} 88%, ${isDarkBg ? "#ffffff" : "#000000"})`;
    const borderExpr = `color-mix(in srgb, ${bgColor} 82%, ${isDarkBg ? "#ffffff" : "#000000"})`;
    const btnFg = isLightAccent ? "#0f1419" : "#ffffff";
    const btnHover = `color-mix(in srgb, ${accentColor} 84%, ${isLightAccent ? "#ffffff" : "#000000"})`;
    const maskColor = isDarkBg ? "rgba(91, 112, 131, 0.4)" : "rgba(0, 0, 0, 0.45)";

    return `
      :root {
        color-scheme: ${isDarkBg ? "dark" : "light"} !important;
        --user-bg: ${bgColor} !important;
        --user-surface: ${surfaceExpr} !important;
        --user-surface-hover: ${hoverExpr} !important;
        --user-bg-translucent: color-mix(in srgb, ${bgColor} 80%, transparent) !important;
        --user-fg: ${isDarkBg ? "#e7e9ea" : "#0f1419"} !important;
        --user-fg-muted: ${isDarkBg ? "#8b98a5" : "#536471"} !important;
        --user-border: ${borderExpr} !important;
        --user-btn-bg: ${accentColor} !important;
        --user-btn-fg: ${btnFg} !important;
        --user-btn-hover: ${btnHover} !important;
        --user-accent-tint: color-mix(in srgb, ${accentColor} 14%, transparent) !important;
        --user-mask: ${maskColor} !important;
      }

      /* ── Global Root & App Shell ── */
      html, body,
      #react-root,
      #react-root > div,
      #react-root > div > div,
      main[role="main"],
      header[role="banner"],
      [data-testid="primaryColumn"],
      [data-testid="sidebarColumn"],
      [data-testid="DMDrawer"],
      [data-testid="GrokDrawer"] {
        background-color: var(--user-bg) !important;
      }

      /* ── Primary CTA Buttons (Post, Follow, Save & New Posts Pill) ── */
      html body [data-testid="SideNav_NewTweet_Button"],
      html body [data-testid="tweetButtonInline"],
      html body [data-testid="tweetButton"],
      html body [data-testid$="-follow"],
      html body [data-testid="Profile_Save_Button"],
      html body [data-testid="pillLabel"],
      html body a[href="/compose/post"][role="link"] {
        background-color: var(--user-btn-bg) !important;
        border-color: var(--user-btn-bg) !important;
        color: var(--user-btn-fg) !important;
      }

      html body [data-testid="SideNav_NewTweet_Button"] *,
      html body [data-testid="tweetButtonInline"] *,
      html body [data-testid="tweetButton"] *,
      html body [data-testid$="-follow"] *,
      html body [data-testid="Profile_Save_Button"] *,
      html body [data-testid="pillLabel"] *,
      html body a[href="/compose/post"][role="link"] * {
        color: var(--user-btn-fg) !important;
      }

      html body [data-testid="SideNav_NewTweet_Button"] svg,
      html body [data-testid="tweetButtonInline"] svg,
      html body [data-testid="tweetButton"] svg,
      html body [data-testid="pillLabel"] svg,
      html body a[href="/compose/post"][role="link"] svg {
        fill: var(--user-btn-fg) !important;
      }

      html body [data-testid="SideNav_NewTweet_Button"]:hover,
      html body [data-testid="tweetButtonInline"]:hover,
      html body [data-testid="tweetButton"]:hover,
      html body [data-testid$="-follow"]:hover,
      html body [data-testid="Profile_Save_Button"]:hover,
      html body [data-testid="pillLabel"]:hover,
      html body a[href="/compose/post"][role="link"]:hover {
        background-color: var(--user-btn-hover) !important;
        border-color: var(--user-btn-hover) !important;
      }

      /* Keep "Following / Siguiendo" (-unfollow) outlined, not solid accent */
      html body [data-testid$="-unfollow"] {
        background-color: transparent !important;
        border-color: var(--user-border) !important;
      }

      /* ── Active Tab Indicator Bar ("Para ti" / "Siguiendo" / Profile Tabs) ── */
      [role="tablist"] [role="tab"][aria-selected="true"] div[style*="rgb(29, 155, 240)"],
      [role="tablist"] [role="tab"][aria-selected="true"] div[style*="#1d9bf0"],
      [role="tablist"] [role="tab"][aria-selected="true"] > div > div > div:last-child:not(:first-child) {
        background-color: var(--user-btn-bg) !important;
      }

      /* ── Links, Mentions, Hashtags, "Show more" (Long Post) & "Show more posts" ── */
      html body [data-testid="tweet-text-show-more-link"],
      html body [data-testid="tweet-text-show-more-link"] *,
      html body [data-testid="tweetText"] a,
      html body [data-testid="tweetText"] a span,
      html body [data-testid="UserDescription"] a,
      html body [data-testid="UserDescription"] a span,
      html body [data-testid="UserUrl"] a,
      html body [data-testid="UserUrl"] span,
      html body a[href^="/hashtag/"],
      html body a[href^="/hashtag/"] span,
      html body a[href*="/i/related_users"] span,
      html body a[href*="/i/connect_people"] span,
      html body [style*="color: rgb(29, 155, 240)"]:not([data-xbg-cta]):not([data-xbg-cta] *),
      html body [style*="color: rgb(29, 155, 240)"]:not([data-xbg-cta]):not([data-xbg-cta] *) span,
      html body [style*="color:#1d9bf0"]:not([data-xbg-cta]):not([data-xbg-cta] *),
      html body [style*="color: #1d9bf0"]:not([data-xbg-cta]):not([data-xbg-cta] *) {
        color: var(--user-btn-bg) !important;
      }

      /* Inline accent backgrounds (e.g. floating "Mostrar posts" / pill banners) */
      html body [style*="background-color: rgb(29, 155, 240)"],
      html body [style*="background-color: rgb(29, 161, 242)"] {
        background-color: var(--user-btn-bg) !important;
        color: var(--user-btn-fg) !important;
      }
      html body [style*="background-color: rgb(29, 155, 240)"] *,
      html body [style*="background-color: rgb(29, 161, 242)"] * {
        color: var(--user-btn-fg) !important;
      }

      /* ── Composer Toolbar Icons (Media, GIF, Poll, Emoji, Schedule, Location) ── */
      [data-testid="toolBar"] button:not([data-testid="tweetButtonInline"]):not([data-testid="tweetButton"]) svg,
      [data-testid="toolBar"] [role="button"]:not([data-testid="tweetButtonInline"]):not([data-testid="tweetButton"]) svg,
      [data-testid="fileInput"] + div svg {
        color: var(--user-btn-bg) !important;
        fill: var(--user-btn-bg) !important;
      }

      [data-testid="toolBar"] button:not([data-testid="tweetButtonInline"]):not([data-testid="tweetButton"]):hover > div,
      [data-testid="toolBar"] [role="button"]:not([data-testid="tweetButtonInline"]):not([data-testid="tweetButton"]):hover > div {
        background-color: var(--user-accent-tint) !important;
      }

      /* ── SVG Inline Presentation Attributes (Progress ring, verified blue, badges) ── */
      svg[fill="#1d9bf0"], svg [fill="#1d9bf0"],
      svg[fill="rgb(29, 155, 240)"], svg [fill="rgb(29, 155, 240)"] {
        fill: var(--user-btn-bg) !important;
      }
      svg[stroke="#1d9bf0"], svg [stroke="#1d9bf0"],
      svg[stroke="rgb(29, 155, 240)"], svg [stroke="rgb(29, 155, 240)"] {
        stroke: var(--user-btn-bg) !important;
      }

      /* ── Sticky Headers & Frosted Glass Top Bars ── */
      [data-testid="primaryColumn"] [style*="backdrop-filter"],
      [data-testid="sidebarColumn"] [style*="backdrop-filter"],
      [data-testid="DMDrawerHeader"] {
        background-color: var(--user-bg-translucent) !important;
      }

      /* ── Timeline, Tweets, Search, Composer & Cards ── */
      [data-testid="cellInnerDiv"],
      [data-testid="tweet"],
      [data-testid="tweetDetail"],
      [data-testid="BottomBar"],
      [data-testid="SideNav_AccountSwitcher_Button"] {
        background-color: var(--user-bg) !important;
      }

      [data-testid="SideNav_AccountSwitcher_Button"]:hover,
      [data-testid="trend"]:hover,
      [data-testid="UserCell"]:hover,
      [data-testid="conversation"]:hover {
        background-color: var(--user-surface-hover) !important;
      }

      [data-testid="SearchBox_Search_Input_Container"],
      form[role="search"] > div > div,
      [data-testid="sidebarColumn"] aside,
      [data-testid="sidebarColumn"] [role="region"],
      [data-testid="card.wrapper"],
      [data-testid="tweetQuote"],
      [data-testid="HoverCard"] > div,
      [data-testid="Dropdown"],
      [role="menu"],
      [role="listbox"] {
        background-color: var(--user-surface) !important;
      }

      [data-testid="SearchBox_Search_Input"],
      form[role="search"] input,
      .DraftEditor-root,
      .public-DraftEditor-content {
        background-color: transparent !important;
        color: var(--user-fg) !important;
      }

      /* ── Modals & Semi-Transparent Backdrop Mask ── */
      [role="dialog"],
      [data-testid="sheetDialog"],
      [data-testid="confirmationSheetDialog"] {
        background-color: var(--user-bg) !important;
      }

      html body [data-testid="mask"] {
        background-color: var(--user-mask) !important;
      }

      /* ── Reversible Layer-3 Data-Attribute Overrides ── */
      [data-xbg-bg="bg"]${NOT_CTA_OR_MEDIA} {
        background-color: var(--user-bg) !important;
      }
      [data-xbg-bg="elevated"]${NOT_CTA_OR_MEDIA} {
        background-color: var(--user-surface) !important;
      }
      [data-xbg-bg="translucent"]${NOT_CTA_OR_MEDIA} {
        background-color: var(--user-bg-translucent) !important;
      }
      html body [data-xbg-bg="accent"] {
        background-color: var(--user-btn-bg) !important;
        color: var(--user-btn-fg) !important;
      }
      html body [data-xbg-bg="accent"] * {
        color: var(--user-btn-fg) !important;
      }
      html body [data-xbg-bg="accent-hover"] {
        background-color: var(--user-btn-hover) !important;
      }
      html body [data-xbg-bg="accent-tint"] {
        background-color: var(--user-accent-tint) !important;
      }
      html body [data-xbg-fg="accent"]:where(:not([data-xbg-cta] *)),
      html body [data-xbg-fg="accent"]:where(:not([data-xbg-cta] *)) span {
        color: var(--user-btn-bg) !important;
      }
      [data-xbg-fg="primary"]${NOT_CTA_OR_MEDIA}:where(:not([data-xbg-cta] *)) {
        color: var(--user-fg) !important;
      }
      [data-xbg-border="accent"] {
        border-color: var(--user-btn-bg) !important;
      }
      [data-xbg-svg-fill="accent"]:not([data-xbg-cta] *) {
        fill: var(--user-btn-bg) !important;
        color: var(--user-btn-bg) !important;
      }
      [data-xbg-svg-stroke="accent"] {
        stroke: var(--user-btn-bg) !important;
      }
    `;
  }

  // ── Layer 3: Reversible DOM Inline & Computed Fallback Scanner ───────────

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "HEAD", "NOSCRIPT", "IMG", "VIDEO", "CANVAS", "SOURCE"]);

  function isProtectedCta(el) {
    const tid = el.getAttribute("data-testid") || "";
    if (
      tid === "SideNav_NewTweet_Button" ||
      tid === "tweetButton" ||
      tid === "tweetButtonInline" ||
      tid === "Profile_Save_Button" ||
      tid === "confirmationSheetConfirm" ||
      tid === "pillLabel" ||
      tid.endsWith("-follow")
    ) {
      return true;
    }
    if (el.tagName === "A" && el.getAttribute("href") === "/compose/post" && el.getAttribute("role") === "link") {
      return true;
    }
    return false;
  }

  function processElement(el, checkComputedFallback = false) {
    if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
    if (el.id === STYLE_ID || el.id === ATOMIC_STYLE_ID) return;

    const tid = el.getAttribute("data-testid") || "";
    if (tid === "mask" || tid === "videoPlayer" || el.closest('[data-testid="videoPlayer"]')) {
      return;
    }

    if (isProtectedCta(el)) {
      el.setAttribute("data-xbg-cta", "1");
      return;
    }
    if (el.closest("[data-xbg-cta]")) {
      return;
    }

    // 1. Inspect inline styles first (unaffected by CSS rules)
    const inlineStyle = el.style;
    if (inlineStyle && inlineStyle.length > 0) {
      if (inlineStyle.backgroundColor) {
        const bgKind = classifyBgColor(parseCssColor(inlineStyle.backgroundColor));
        if (bgKind) {
          el.setAttribute("data-xbg-bg", bgKind);
        } else if (el.hasAttribute("data-xbg-bg")) {
          el.removeAttribute("data-xbg-bg");
        }
      }

      if (inlineStyle.color && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
        const parsedC = parseCssColor(inlineStyle.color);
        if (classifyAccentColor(parsedC)) {
          el.setAttribute("data-xbg-fg", "accent");
        } else if (parsedC && parsedC.a === 1 && primaryTextRgbSet.has(`${parsedC.r},${parsedC.g},${parsedC.b}`)) {
          el.setAttribute("data-xbg-fg", "primary");
        } else if (el.hasAttribute("data-xbg-fg")) {
          el.removeAttribute("data-xbg-fg");
        }
      }

      if (inlineStyle.borderColor && classifyAccentColor(parseCssColor(inlineStyle.borderColor))) {
        el.setAttribute("data-xbg-border", "accent");
      }
    }

    // 2. Inspect SVG fill / stroke attributes & inline styles
    const tag = el.tagName;
    if (tag === "svg" || tag === "path" || tag === "circle" || tag === "g" || tag === "rect") {
      const fillAttr = (inlineStyle && inlineStyle.fill) || el.getAttribute("fill");
      if (fillAttr && classifyAccentColor(parseCssColor(fillAttr))) {
        el.setAttribute("data-xbg-svg-fill", "accent");
      }
      const strokeAttr = (inlineStyle && inlineStyle.stroke) || el.getAttribute("stroke");
      if (strokeAttr && classifyAccentColor(parseCssColor(strokeAttr))) {
        el.setAttribute("data-xbg-svg-stroke", "accent");
      }
    }

    // 3. Computed fallback for elements styled by cross-origin sheets or dynamic rules
    if (checkComputedFallback) {
      const needBg =
        !el.hasAttribute("data-xbg-bg") &&
        !hasHandledClass(el, pureAtomicBgClasses) &&
        !hasHandledClass(el, pureAtomicAccentBgClasses);
      const needFg =
        (tag === "svg" || tag === "A" || tag === "SPAN" || tag === "BUTTON" || tag === "DIV") &&
        !el.hasAttribute("data-xbg-fg") &&
        !hasHandledClass(el, pureAtomicFgClasses);

      if (needBg || needFg) {
        const comp = window.getComputedStyle(el);
        if (needBg) {
          const bgKind = classifyBgColor(parseCssColor(comp.backgroundColor));
          if (bgKind) {
            if (bgKind === "bg" && comp.backdropFilter && comp.backdropFilter !== "none") {
              el.setAttribute("data-xbg-bg", "translucent");
            } else {
              el.setAttribute("data-xbg-bg", bgKind);
            }
            el.setAttribute("data-xbg-computed", "1");
          }
        }
        if (needFg && classifyAccentColor(parseCssColor(comp.color))) {
          el.setAttribute("data-xbg-fg", "accent");
          el.setAttribute("data-xbg-computed", "1");
        }
      }
    }
  }

  function scanSubtree(root, checkComputedFallback = false) {
    if (!state.enabled || !root) return;
    if (root.nodeType === 1) {
      processElement(root, checkComputedFallback);
      const descendants = root.querySelectorAll("*");
      for (let i = 0; i < descendants.length; i++) {
        processElement(descendants[i], checkComputedFallback);
      }
    }
  }

  // ── MutationObserver (ChildList + Style/Class/State Attributes) ──────────

  let observer = null;
  let cssomWatchInterval = null;
  let pendingRoots = new Set();
  let pendingAttrElements = new Set();
  let flushScheduled = false;

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(() => {
      flushScheduled = false;
      if (!state.enabled) {
        pendingRoots.clear();
        pendingAttrElements.clear();
        return;
      }

      // Ensure our <style> tags weren't removed by React head reconciliation
      if (!document.getElementById(STYLE_ID)) {
        injectStructuralStyle();
      }
      detectNativeXAccent();
      syncAtomicStylesheets();

      // Re-evaluate elements whose class/style/aria attributes mutated
      for (const el of pendingAttrElements) {
        if (!el.isConnected) continue;
        if (el.hasAttribute("data-xbg-computed")) {
          el.removeAttribute("data-xbg-bg");
          el.removeAttribute("data-xbg-fg");
          el.removeAttribute("data-xbg-computed");
        }
        processElement(el, true);
      }
      pendingAttrElements.clear();

      // Scan newly added subtrees
      for (const node of pendingRoots) {
        if (node.isConnected) {
          scanSubtree(node, true);
        }
      }
      pendingRoots.clear();
    });
  }

  function ensureObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (!state.enabled) return;

      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === "childList") {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node.nodeType === 1) {
              if (node.tagName === "STYLE" || node.tagName === "LINK") {
                if (node.id !== STYLE_ID && node.id !== ATOMIC_STYLE_ID) {
                  scheduleFlush();
                }
              } else {
                pendingRoots.add(node);
              }
            }
          }
        } else if (m.type === "attributes" && m.target && m.target.nodeType === 1) {
          const attr = m.attributeName;
          if (attr && !attr.startsWith("data-xbg-")) {
            pendingAttrElements.add(m.target);
          }
        }
      }

      if (pendingRoots.size > 0 || pendingAttrElements.size > 0) {
        scheduleFlush();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "fill", "stroke", "aria-selected", "aria-checked"]
    });

    if (!cssomWatchInterval) {
      // Catch silent CSSStyleSheet.insertRule() updates that don't mutate DOM nodes
      cssomWatchInterval = setInterval(() => {
        if (!state.enabled || document.hidden) return;
        const sheets = document.styleSheets;
        for (let s = 0; s < sheets.length; s++) {
          const sheet = sheets[s];
          const owner = sheet.ownerNode;
          if (owner && (owner.id === STYLE_ID || owner.id === ATOMIC_STYLE_ID)) continue;
          try {
            if (sheet.cssRules && sheetRuleCounts.get(sheet) !== sheet.cssRules.length) {
              syncAtomicStylesheets();
              if (document.body) scanSubtree(document.body, true);
              break;
            }
          } catch {
            // Ignore cross-origin sheets
          }
        }
      }, 1200);
    }
  }

  // ── Apply & Reset Lifecycle ──────────────────────────────────────────────

  function injectStructuralStyle() {
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = buildStructuralCss(state.bg, state.accent, state.surfaceRelief);
  }

  function applyColors(bgColor, accentColor, surfaceRelief = true) {
    state.enabled = true;
    state.bg = bgColor || DEFAULT_BG_COLOR;
    state.accent = accentColor || DEFAULT_ACCENT_COLOR;
    state.surfaceRelief = surfaceRelief !== false;

    detectNativeXAccent();
    injectStructuralStyle();
    syncAtomicStylesheets(true);

    if (document.body) {
      scanSubtree(document.body, true);
    }
    ensureObserver();
  }

  function removeCustomColors() {
    state.enabled = false;

    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (cssomWatchInterval) {
      clearInterval(cssomWatchInterval);
      cssomWatchInterval = null;
    }
    pendingRoots.clear();
    pendingAttrElements.clear();

    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) styleEl.remove();

    const atomicEl = document.getElementById(ATOMIC_STYLE_ID);
    if (atomicEl) atomicEl.remove();

    // Cleanly remove all reversible data-xbg-* attributes so original page state is 100% intact
    const tagged = document.querySelectorAll(
      "[data-xbg-bg],[data-xbg-fg],[data-xbg-border],[data-xbg-svg-fill],[data-xbg-svg-stroke],[data-xbg-cta],[data-xbg-computed]"
    );
    for (let i = 0; i < tagged.length; i++) {
      const el = tagged[i];
      el.removeAttribute("data-xbg-bg");
      el.removeAttribute("data-xbg-fg");
      el.removeAttribute("data-xbg-border");
      el.removeAttribute("data-xbg-svg-fill");
      el.removeAttribute("data-xbg-svg-stroke");
      el.removeAttribute("data-xbg-cta");
      el.removeAttribute("data-xbg-computed");
    }
  }

  // ── Messaging & Storage Listeners ────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "changeColors") {
      applyColors(message.bgColor, message.accentColor, message.surfaceRelief);
      sendResponse({ success: true });
    } else if (message.action === "resetColors") {
      removeCustomColors();
      sendResponse({ success: true });
    }
    return true;
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (changes.enabled || changes.bgColor || changes.accentColor || changes.surfaceRelief) {
      const data = await chrome.storage.local.get(["enabled", "bgColor", "accentColor", "surfaceRelief"]);
      const isEnabled = data.enabled !== undefined
        ? data.enabled
        : Boolean(data.bgColor || data.accentColor);

      if (isEnabled) {
        applyColors(
          data.bgColor || DEFAULT_BG_COLOR,
          data.accentColor || DEFAULT_ACCENT_COLOR,
          data.surfaceRelief !== false
        );
      } else {
        removeCustomColors();
      }
    }
  });

  // ── Immediate Initialization (Prevents Flash at document_start) ──────────

  async function init() {
    try {
      const data = await chrome.storage.local.get(["enabled", "bgColor", "accentColor", "surfaceRelief"]);
      const hasLegacyCustom =
        data.enabled === undefined &&
        ((data.bgColor && data.bgColor !== DEFAULT_BG_COLOR) ||
         (data.accentColor && data.accentColor !== DEFAULT_ACCENT_COLOR));

      if (data.enabled === true || hasLegacyCustom) {
        applyColors(
          data.bgColor || DEFAULT_BG_COLOR,
          data.accentColor || DEFAULT_ACCENT_COLOR,
          data.surfaceRelief !== false
        );

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            if (state.enabled) {
              detectNativeXAccent();
              syncAtomicStylesheets();
              scanSubtree(document.body, true);
            }
          }, { once: true });
        }

        window.addEventListener("load", () => {
          if (state.enabled) {
            detectNativeXAccent();
            syncAtomicStylesheets();
            scanSubtree(document.body, true);
          }
        }, { once: true });
      }
    } catch (err) {
      console.warn("X Background Color Changer v2: init error", err.message);
    }
  }

  init();
})();
