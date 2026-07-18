import { list } from "@vercel/blob";
import { db } from "@/lib/db/client";

export interface TableRowCount {
  label: string;
  count: number;
}

export interface BlobUsage {
  prefix: string;
  count: number;
  bytes: number;
}

export interface AiCostByFeature {
  feature: string;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface MonitoringStats {
  rowCounts: TableRowCount[];
  databaseSizeBytes: number | null;
  databaseSizePretty: string | null;
  blobUsage: BlobUsage[];
  blobTotalBytes: number;
  blobTotalCount: number;
  aiCostByFeature: AiCostByFeature[];
  aiTotalCostUsd: number;
}

async function getRowCounts(): Promise<TableRowCount[]> {
  const [
    jobs, customers, invoices, quotes, variations, complianceDocuments,
    voiceNotes, timeEntries, users, assignments, materialEntries,
    jobCommunications, documentChunks,
  ] = await Promise.all([
    db.job.count(),
    db.customer.count(),
    db.invoice.count(),
    db.quote.count(),
    db.variation.count(),
    db.complianceDocument.count(),
    db.voiceNote.count(),
    db.timeEntry.count(),
    db.user.count(),
    db.assignment.count(),
    db.materialEntry.count(),
    db.jobCommunication.count(),
    db.documentChunk.count(),
  ]);

  return [
    { label: "Jobs", count: jobs },
    { label: "Customers", count: customers },
    { label: "Invoices", count: invoices },
    { label: "Quotes", count: quotes },
    { label: "Variations", count: variations },
    { label: "Compliance documents", count: complianceDocuments },
    { label: "Voice notes", count: voiceNotes },
    { label: "Time entries", count: timeEntries },
    { label: "Team members", count: users },
    { label: "Assignments", count: assignments },
    { label: "Material entries", count: materialEntries },
    { label: "Job communications", count: jobCommunications },
    { label: "Search index chunks", count: documentChunks },
  ];
}

async function getDatabaseSize(): Promise<{ bytes: number | null; pretty: string | null }> {
  // Not all Postgres hosts grant this to every role — degrade gracefully
  // rather than breaking the whole dashboard over one unavailable metric.
  try {
    const rows = await db.$queryRaw<{ bytes: bigint; pretty: string }[]>`
      SELECT pg_database_size(current_database()) AS bytes,
             pg_size_pretty(pg_database_size(current_database())) AS pretty
    `;
    const row = rows[0];
    return row ? { bytes: Number(row.bytes), pretty: row.pretty } : { bytes: null, pretty: null };
  } catch {
    return { bytes: null, pretty: null };
  }
}

async function getBlobUsage(): Promise<{ byPrefix: BlobUsage[]; totalBytes: number; totalCount: number }> {
  try {
    const res = await list({ limit: 1000 });
    const byPrefix = new Map<string, { count: number; bytes: number }>();
    for (const blob of res.blobs) {
      const prefix = blob.pathname.includes("/") ? blob.pathname.split("/")[0] : "(root)";
      const entry = byPrefix.get(prefix) ?? { count: 0, bytes: 0 };
      entry.count += 1;
      entry.bytes += blob.size;
      byPrefix.set(prefix, entry);
    }
    const totalBytes = res.blobs.reduce((sum, b) => sum + b.size, 0);
    return {
      byPrefix: Array.from(byPrefix.entries()).map(([prefix, v]) => ({ prefix, ...v })),
      totalBytes,
      totalCount: res.blobs.length,
    };
  } catch {
    return { byPrefix: [], totalBytes: 0, totalCount: 0 };
  }
}

async function getAiCostByFeature(): Promise<{ byFeature: AiCostByFeature[]; totalCostUsd: number }> {
  const logs = await db.aiAuditLog.findMany({
    select: { feature: true, promptTokens: true, outputTokens: true, costUsd: true },
  });

  const byFeature = new Map<string, { calls: number; promptTokens: number; outputTokens: number; costUsd: number }>();
  for (const log of logs) {
    const entry = byFeature.get(log.feature) ?? { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0 };
    entry.calls += 1;
    entry.promptTokens += log.promptTokens;
    entry.outputTokens += log.outputTokens;
    entry.costUsd += Number(log.costUsd);
    byFeature.set(log.feature, entry);
  }

  const totalCostUsd = logs.reduce((sum, l) => sum + Number(l.costUsd), 0);
  return {
    byFeature: Array.from(byFeature.entries()).map(([feature, v]) => ({ feature, ...v })),
    totalCostUsd,
  };
}

export async function getMonitoringStats(): Promise<MonitoringStats> {
  const [rowCounts, dbSize, blob, ai] = await Promise.all([
    getRowCounts(),
    getDatabaseSize(),
    getBlobUsage(),
    getAiCostByFeature(),
  ]);

  return {
    rowCounts,
    databaseSizeBytes: dbSize.bytes,
    databaseSizePretty: dbSize.pretty,
    blobUsage: blob.byPrefix,
    blobTotalBytes: blob.totalBytes,
    blobTotalCount: blob.totalCount,
    aiCostByFeature: ai.byFeature,
    aiTotalCostUsd: ai.totalCostUsd,
  };
}
