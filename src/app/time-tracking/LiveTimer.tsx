"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/time/utils";

interface LiveTimerProps {
  clockInTime: string;
}

export function LiveTimer({ clockInTime }: LiveTimerProps) {
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const start = new Date(clockInTime).getTime();

    function tick() {
      setMinutes(Math.floor((Date.now() - start) / 60_000));
    }

    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [clockInTime]);

  return (
    <span className="font-mono text-2xl tabular-nums text-amber-500">
      {formatDuration(minutes)}
    </span>
  );
}
