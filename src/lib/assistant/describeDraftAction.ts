interface DraftVariationInput {
  technicianName: string;
  description: string;
  costEstimate: number;
}

interface DraftQuoteLineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

interface DraftQuoteInput {
  customerName: string;
  siteName: string;
  jobType: string;
  lineItems: DraftQuoteLineItem[];
}

// Human-readable confirmation prompt shown to the user before a draftVariation
// or draftQuote tool call is actually executed — the whole point of the
// confirm step is that the user can read what's about to be created.
export function describeDraftAction(tool: string, input: Record<string, unknown>): string {
  if (tool === "draftVariation") {
    const { technicianName, description, costEstimate } = input as unknown as DraftVariationInput;
    return `Draft a variation for **${technicianName}**: "${description}" — $${costEstimate}. Create it?`;
  }
  if (tool === "draftQuote") {
    const { customerName, siteName, jobType, lineItems } = input as unknown as DraftQuoteInput;
    const total = lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
    const itemCount = lineItems.length === 1 ? "1 line item" : `${lineItems.length} line items`;
    return `Draft a quote for **${customerName}** — ${siteName} (${jobType}): ${itemCount} totalling $${total}. Create it?`;
  }
  return `Run ${tool}?`;
}
