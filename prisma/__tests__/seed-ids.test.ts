import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SEED_JOB_IDS, SEED_CUSTOMER_IDS } from "../seed";

// Every jobId/customerId Zod schema in the app (variations, schedule
// assignments, clock-in, compliance documents, asset-job linking, job
// creation, contract/asset/quote creation) requires a real UUID. Seed rows
// with human-readable IDs like "seed-job-glencore" or "seed-customer-bhp"
// fail that check the moment a technician or office user selects them —
// e.g. a variation submission or a schedule assignment 400s with "Invalid
// input"/"Invalid UUID". This test pins the invariant so seed data can't
// drift out of format again.
const uuid = z.string().uuid();

describe("seed job IDs", () => {
  it("are all valid UUIDs", () => {
    for (const id of SEED_JOB_IDS) {
      expect(uuid.safeParse(id).success).toBe(true);
    }
  });
});

describe("seed customer IDs", () => {
  it("are all valid UUIDs", () => {
    for (const id of SEED_CUSTOMER_IDS) {
      expect(uuid.safeParse(id).success).toBe(true);
    }
  });
});
