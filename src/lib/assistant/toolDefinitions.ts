import type Anthropic from "@anthropic-ai/sdk";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "findJobs",
    description:
      "Search jobs by status, site name, customer name, or whether they're overdue (active jobs whose logged hours exceed quoted hours). Call this for questions like 'which jobs are overdue' or 'show me jobs at Weipa'.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["scheduled", "active", "complete", "cancelled"] },
        siteName: { type: "string" },
        customerName: { type: "string" },
        overdueOnly: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "findComplianceDocuments",
    description:
      "Find compliance document templates missing a submitted document for a job (e.g. 'which jobs are missing a SWMS'). Omit jobId to list all active templates.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        missingTemplateType: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "findAssignments",
    description:
      "Find which technicians worked at which sites and when. Call this for questions like 'which technicians worked at Site X' or 'who's assigned this week'.",
    input_schema: {
      type: "object",
      properties: {
        technicianName: { type: "string" },
        dateFrom: { type: "string", description: "ISO date string" },
        dateTo: { type: "string", description: "ISO date string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "semanticSearchTool",
    description:
      "Search voice note transcripts and job communications by meaning, not exact keywords. Call this for questions like 'find notes mentioning corrosion' or 'search for mentions of a leak'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        jobId: { type: "string", description: "Optional — scope the search to one job" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "draftVariation",
    description:
      "Draft a job variation on a named technician's behalf. Only usable by director/service_manager/admin roles. Creates a real Variation record with status 'pending', reviewed the same way as a technician-submitted one.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        technicianName: { type: "string", description: "The technician this variation is being drafted for" },
        description: { type: "string" },
        costEstimate: { type: "number" },
      },
      required: ["jobId", "technicianName", "description", "costEstimate"],
      additionalProperties: false,
    },
  },
  {
    name: "draftQuote",
    description:
      "Draft a quote. Only usable by admin/director/sales_engineer roles. Creates a real Quote record with status 'draft', reviewed the same way as a manually-started one.",
    input_schema: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        siteName: { type: "string" },
        jobType: { type: "string" },
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              qty: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["description", "qty", "unitPrice"],
          },
        },
      },
      required: ["customerName", "siteName", "jobType", "lineItems"],
      additionalProperties: false,
    },
  },
];
