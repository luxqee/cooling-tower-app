export interface DateRange {
  startDate: Date;
  endDate: Date; // same as startDate for single-day
}

export function detectConflict(existing: DateRange, incoming: DateRange): boolean {
  return existing.startDate <= incoming.endDate && existing.endDate >= incoming.startDate;
}
