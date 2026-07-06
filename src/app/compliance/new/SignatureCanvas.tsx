"use client";

import { useRef, useEffect, useState } from "react";

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
}

export function SignatureCanvas({ onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    ctx.strokeStyle = dark ? "#e2e8f0" : "#1e293b";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  useEffect(() => {
    function handleWindowMouseUp() {
      if (!drawing.current) return;
      drawing.current = false;
      setIsEmpty(false);
      onChange(canvasRef.current?.toDataURL("image/png") ?? null);
    }
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [onChange]);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    setIsEmpty(false);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Re-apply stroke style after clear (ctx state survives, but good to reinforce)
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    ctx.strokeStyle = dark ? "#e2e8f0" : "#1e293b";
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1">
      {/* Wrapper height (200px) must match the canvas height attribute to keep coordinate mapping 1:1 */}
      <div
        className="relative rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden touch-none"
        style={{ height: 200 }}
      >
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          aria-label="Signature pad — draw your signature here"
          className="w-full h-full"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 pointer-events-none select-none">
            Sign here
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2"
      >
        Clear
      </button>
    </div>
  );
}
