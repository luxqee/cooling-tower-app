export function calcDurationMinutes(clockIn: Date, clockOut: Date): number {
  return Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000);
}

export function isOverQuota(actualHours: number, quotedHours: number): boolean {
  return actualHours > quotedHours * 1.1;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
