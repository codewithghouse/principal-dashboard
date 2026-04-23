import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";

const SPLASH_DURATION_MS = 2500;
const FADE_MS = 400;

interface Props {
  onFinish: () => void;
}

const SplashScreen = ({ onFinish }: Props) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), SPLASH_DURATION_MS - FADE_MS);
    const finishTimer = setTimeout(onFinish, SPLASH_DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: "#EEF4FF",
        opacity: fading ? 0 : 1,
        transform: fading ? "scale(1.04)" : "scale(1)",
        transition: `opacity ${FADE_MS}ms ease-in-out, transform ${FADE_MS}ms ease-in-out`,
        pointerEvents: fading ? "none" : "auto",
      }}
      aria-label="Loading Principal Dashboard"
    >
      <div className="flex flex-col items-center gap-5">
        <div
          className="w-24 h-24 rounded-[28px] flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #0033CC 0%, #0055FF 100%)",
            boxShadow: "0 18px 44px rgba(0, 51, 204, 0.28), 0 4px 16px rgba(0, 0, 0, 0.10)",
          }}
        >
          <GraduationCap className="w-12 h-12 text-white" strokeWidth={2.2} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[20px] font-bold tracking-tight" style={{ color: "#001040" }}>
            Principal Dashboard
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: "#5070B0" }}>
            School Intelligence
          </p>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
