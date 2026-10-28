import { useEffect, useRef, useState } from "react";
import { formatFrameClock, FRAME_READOUT_MS, readLiveFrame } from "@/kushim/frame-time";

const CLOSED = "Bildzeit";

/**
 * Toggle for the live frame-time line. Off by default.
 * The numbers update inside this component so the chat does not re-render.
 */
export function BildzeitReadout() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(CLOSED);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = buttonRef.current;
    if (!open) {
      setLabel((prev) => (prev === CLOSED ? prev : CLOSED));
      if (node) {
        delete node.dataset.ms;
        delete node.dataset.fps;
        delete node.dataset.peakMs;
        delete node.dataset.frames;
      }
      return;
    }
    const write = () => {
      const clock = readLiveFrame();
      const text = formatFrameClock(clock);
      setLabel((prev) => (prev === text ? prev : text));
      const current = buttonRef.current;
      if (!current || clock.frames <= 0) return;
      current.dataset.ms = clock.meanMs.toFixed(1);
      current.dataset.fps = String(Math.round(clock.fps));
      current.dataset.peakMs = clock.peakMs.toFixed(1);
      current.dataset.frames = String(clock.frames);
    };
    write();
    const id = window.setInterval(write, FRAME_READOUT_MS);
    return () => window.clearInterval(id);
  }, [open]);

  return (
    <div className="pointer-events-none absolute top-24 left-4 z-10 md:top-28 md:left-6">
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={open}
        aria-label={open ? "Bildzeit ausblenden" : "Bildzeit einblenden"}
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex min-h-11 max-w-xs items-center text-left font-mono text-xs tabular-nums tracking-wide text-mist"
      >
        {label}
      </button>
    </div>
  );
}
