/**
 * SHARED TYPES — derived directly from the PRD data model.
 * These match the six core tables that will be created in Phase 1a.
 */

import type { UserRole } from "@/lib/nav-config";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export type JobStatus = "scheduled" | "active" | "complete" | "cancelled";

export interface Job {
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  status: JobStatus;
  quotedHours: number;
  createdAt: Date;
}

export interface Assignment {
  id: string;
  userId: string;
  jobId: string;
  assignedDate: Date;
}

export type TimeEntryStatus = "active" | "complete";

export interface TimeEntry {
  id: string;
  userId: string;
  jobId: string;
  clockInTime: Date;
  clockOutTime: Date | null;
  durationMinutes: number | null;
  status: TimeEntryStatus;
}

export type VariationStatus = "pending" | "approved" | "rejected" | "queried";

export interface Variation {
  id: string;
  jobId: string;
  technicianId: string;
  description: string;
  costEstimate: number;
  photoUrl: string | null;
  status: VariationStatus;
  directorDecision: VariationStatus | null;
  decisionReason: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
}

export interface Invoice {
  id: string;
  jobId: string;
  baseAmount: number;
  variationsTotal: number;
  totalAmount: number;
  createdAt: Date;
}
