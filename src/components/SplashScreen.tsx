import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "edullent_principal_splash_shown_v1";
const MOBILE_BREAKPOINT = 768;
const TOTAL_DURATION_MS = 4200;
const FADE_OUT_MS = 420;

function shouldShowSplash(): boolean {
  if (typeof window === "undefined") return false;
  if (window.innerWidth >= MOBILE_BREAKPOINT) return false;
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return false;
  } catch {
    // sessionStorage blocked (private mode) — still show, just won't persist
  }
  return true;
}

export function SplashScreen() {
  const [visible, setVisible] = useState<boolean>(() => shouldShowSplash());
  const [exiting, setExiting] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!visible) return;

    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const showFor = prefersReducedMotion ? 900 : TOTAL_DURATION_MS;

    document.body.style.overflow = "hidden";

    const fadeTimer = window.setTimeout(() => setExiting(true), showFor);
    const removeTimer = window.setTimeout(
      () => setVisible(false),
      showFor + FADE_OUT_MS
    );
    timers.current.push(fadeTimer, removeTimer);

    return () => {
      document.body.style.overflow = "";
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [visible]);

  const handleSkip = () => {
    if (exiting) return;
    setExiting(true);
    const t = window.setTimeout(() => setVisible(false), FADE_OUT_MS);
    timers.current.push(t);
  };

  if (!visible) return null;

  return (
    <div
      className={`edu-splash${exiting ? " edu-splash--exit" : ""}`}
      onClick={handleSkip}
      role="status"
      aria-live="polite"
      aria-label="Edullent is loading"
    >
      <style>{splashStyles}</style>

      <div className="edu-splash__stage">
        <div className="edu-splash__logo">
          <svg
            className="edu-splash__svg"
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="eduSplashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3c3f9f" />
                <stop offset="100%" stopColor="#708ecb" />
              </linearGradient>
            </defs>
            <rect
              className="edu-splash__bg"
              x="0"
              y="0"
              width="200"
              height="200"
              rx="28"
              fill="url(#eduSplashGrad)"
            />
            <polygon className="edu-splash__bar edu-splash__bar--1" points="42,31 62,47 62,130 42,114" />
            <polygon className="edu-splash__bar edu-splash__bar--2" points="74,59 94,75 94,158 74,142" />
            <polygon className="edu-splash__bar edu-splash__bar--3" points="106,75 126,59 126,142 106,158" />
            <polygon className="edu-splash__bar edu-splash__bar--4" points="138,47 158,31 158,114 138,130" />
          </svg>
        </div>

        <div className="edu-splash__wordmark" aria-hidden="true">
          <span>E</span><span>D</span><span>U</span><span>L</span>
          <span>L</span><span>E</span><span>N</span><span>T</span>
        </div>
      </div>
    </div>
  );
}

const splashStyles = `
@font-face {
  font-family: 'Mokoto';
  src: url('/fonts/mokoto.regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}

.edu-splash {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: linear-gradient(180deg, #f9fafe 0%, #eaf0fa 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  opacity: 1;
  transition: opacity ${FADE_OUT_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
  font-family: 'Mokoto', 'Audiowide', 'Arial Black', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}
.edu-splash--exit { opacity: 0; pointer-events: none; }

.edu-splash__stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edu-splash__logo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 52px;
  height: 52px;
  transform: translate(-50%, -50%);
  animation: eduSplashMoveLeft 0.75s cubic-bezier(0.65, 0, 0.35, 1) 2.4s forwards;
  will-change: transform;
}
@keyframes eduSplashMoveLeft {
  to { transform: translate(calc(-50% - 108px), -50%); }
}

.edu-splash__svg { width: 100%; height: 100%; display: block; }

.edu-splash__bg {
  opacity: 0;
  transform-origin: center;
  transform-box: fill-box;
  animation: eduSplashBgPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.8s forwards;
}
@keyframes eduSplashBgPop {
  0%   { opacity: 0; transform: scale(0.5); }
  100% { opacity: 1; transform: scale(1); }
}

.edu-splash__bar {
  fill: #ffffff;
  opacity: 0;
  transform: translateY(-280px);
}
@keyframes eduSplashDropBar {
  0%   { transform: translateY(-280px); opacity: 0; }
  10%  { opacity: 1; }
  88%  { transform: translateY(6px); }
  100% { transform: translateY(0); opacity: 1; }
}
.edu-splash__bar--1 { animation: eduSplashDropBar 0.45s cubic-bezier(0.5, 0, 0.75, 0.5) 0.15s forwards; }
.edu-splash__bar--2 { animation: eduSplashDropBar 0.45s cubic-bezier(0.5, 0, 0.75, 0.5) 0.55s forwards; }
.edu-splash__bar--3 { animation: eduSplashDropBar 0.45s cubic-bezier(0.5, 0, 0.75, 0.5) 0.95s forwards; }
.edu-splash__bar--4 { animation: eduSplashDropBar 0.45s cubic-bezier(0.5, 0, 0.75, 0.5) 1.35s forwards; }

.edu-splash__wordmark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-72px, -50%);
  font-size: 48px;
  font-weight: 400;
  color: #1d1d6e;
  letter-spacing: 1px;
  display: flex;
  white-space: nowrap;
  line-height: 1;
}
/* Override the global Plus Jakarta Sans rule from index.css
   (html, body, *, *::before, *::after) so the wordmark spans
   actually pick up Mokoto. !important required because the
   global rule applies directly to every element via *. */
.edu-splash__wordmark,
.edu-splash__wordmark span {
  font-family: 'Mokoto', 'Audiowide', 'Arial Black', sans-serif !important;
}
.edu-splash__wordmark span {
  display: inline-block;
  opacity: 0;
  transform: translateY(16px);
  animation: eduSplashLetterIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.edu-splash__wordmark span:nth-child(1) { animation-delay: 3.15s; }
.edu-splash__wordmark span:nth-child(2) { animation-delay: 3.23s; }
.edu-splash__wordmark span:nth-child(3) { animation-delay: 3.31s; }
.edu-splash__wordmark span:nth-child(4) { animation-delay: 3.39s; }
.edu-splash__wordmark span:nth-child(5) { animation-delay: 3.47s; }
.edu-splash__wordmark span:nth-child(6) { animation-delay: 3.55s; }
.edu-splash__wordmark span:nth-child(7) { animation-delay: 3.63s; }
.edu-splash__wordmark span:nth-child(8) { animation-delay: 3.71s; }
@keyframes eduSplashLetterIn {
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .edu-splash__logo { animation: none; transform: translate(calc(-50% - 108px), -50%); }
  .edu-splash__bg { opacity: 1; transform: none; animation: none; }
  .edu-splash__bar { opacity: 1; transform: none; animation: none; }
  .edu-splash__wordmark span {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
`;

export default SplashScreen;
