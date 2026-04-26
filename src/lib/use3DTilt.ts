import type React from "react";

/**
 * 3D tilt hover handlers for cards. Attach via
 * `onMouseEnter/onMouseMove/onMouseLeave`.
 *
 * Works on any HTMLElement so it can decorate `<div>`, `<button>`, `<a>`,
 * etc. without fighting TypeScript.
 *
 * On hover, the card lifts (rotateX/rotateY tilt + translateY) AND the
 * `box-shadow` intensifies into a blue halo around the card — user
 * explicitly asked for the blue glow to live in the shadow, not as a
 * cursor-tracking inner overlay.
 *
 * Usage:
 *   <div {...tilt3D} style={{ boxShadow: BASE_SHADOW, ...tilt3DStyle }}>
 *
 * The base `boxShadow` you pass on the card is remembered on mouse-enter
 * and restored on leave — no need for a `data-glow` child element.
 *
 * For depth on inner elements, add `transform: "translateZ(10–20px)"` to
 * children (icons, value numbers). The parent's `transformStyle:
 * preserve-3d` (included in `tilt3DStyle`) makes that lift render.
 */
type TiltEl = HTMLElement;

// Stored per-element so we can restore the original shadow on leave.
const ORIGINAL_SHADOW = new WeakMap<HTMLElement, string>();

// Soft blue hover halo.
const HOVER_SHADOW =
  "0 0 0 0.5px rgba(0,85,255,0.14)," +
  " 0 8px 24px rgba(0,85,255,0.16)," +
  " 0 20px 46px rgba(0,85,255,0.18)";

// No `scale()` anywhere — scaling caused sub-pixel text blur on hover.
// We use translateY lift + (for profile variant) rotateX/rotateY only.
const SHARP_RENDERING =
  "transform; backface-visibility: hidden; -webkit-backface-visibility: hidden;";

// ── Default: Dashboard-style pop (lift + slight grow) ──────────────────
export const tilt3D = {
  onMouseEnter: (e: React.MouseEvent<TiltEl>) => {
    const el = e.currentTarget as HTMLElement;
    if (!ORIGINAL_SHADOW.has(el)) {
      ORIGINAL_SHADOW.set(el, el.style.boxShadow);
    }
    el.style.backfaceVisibility = "hidden";
    (el.style as any).webkitBackfaceVisibility = "hidden";
    el.style.transition =
      "transform 0.22s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.22s ease";
    el.style.transform = "translate3d(0,-5px,0)";
    el.style.boxShadow = HOVER_SHADOW;
  },
  onMouseMove: (_e: React.MouseEvent<TiltEl>) => {
    // no-op — no cursor-tracking tilt on regular cards
  },
  onMouseLeave: (e: React.MouseEvent<TiltEl>) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transition =
      "transform 0.28s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.28s ease";
    el.style.transform = "translate3d(0,0,0)";
    const orig = ORIGINAL_SHADOW.get(el);
    if (orig !== undefined) el.style.boxShadow = orig;
  },
};

// ── Profile variant: slightly stronger pop for Students scholar grid ──
export const tilt3DProfile = {
  onMouseEnter: (e: React.MouseEvent<TiltEl>) => {
    const el = e.currentTarget as HTMLElement;
    if (!ORIGINAL_SHADOW.has(el)) {
      ORIGINAL_SHADOW.set(el, el.style.boxShadow);
    }
    el.style.backfaceVisibility = "hidden";
    (el.style as any).webkitBackfaceVisibility = "hidden";
    el.style.transition =
      "transform 0.22s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.22s ease";
    el.style.transform = "translate3d(0,-7px,0)";
    el.style.boxShadow = HOVER_SHADOW;
  },
  onMouseMove: (_e: React.MouseEvent<TiltEl>) => {
    // no-op — rotation removed, keeps text crisp
  },
  onMouseLeave: (e: React.MouseEvent<TiltEl>) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transition =
      "transform 0.28s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.28s ease";
    el.style.transform = "translate3d(0,0,0)";
    const orig = ORIGINAL_SHADOW.get(el);
    if (orig !== undefined) el.style.boxShadow = orig;
  },
};

void SHARP_RENDERING;

/** Style fragment to spread on the card's `style` prop.
 * backface-visibility + flat transform-style keep text perfectly crisp
 * whether the card is at rest or lifted. */
export const tilt3DStyle = {
  transformStyle: "flat" as const,
  backfaceVisibility: "hidden" as const,
  WebkitBackfaceVisibility: "hidden" as const,
};

// ── Canonical blue-halo card shadows ─────────────────────────────────────────
// Dimmed per user feedback — soft ambient blue halo around every card.
// Use these everywhere for a uniform look.
export const BLUE_SHADOW =
  "0 0 0 0.5px rgba(0,85,255,0.09), " +
  "0 2px 10px rgba(0,85,255,0.10), " +
  "0 10px 26px rgba(0,85,255,0.12)";

export const BLUE_SHADOW_LG =
  "0 0 0 0.5px rgba(0,85,255,0.10), " +
  "0 4px 16px rgba(0,85,255,0.12), " +
  "0 18px 44px rgba(0,85,255,0.15)";

export const BLUE_SHADOW_BTN =
  "0 5px 18px rgba(0,85,255,0.34), " +
  "0 2px 5px rgba(0,85,255,0.18)";
