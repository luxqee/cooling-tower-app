import { describe, it, expect } from "vitest";
import { validateVariationInput } from "@/lib/variations/validate";

describe("validateVariationInput", () => {
  const valid = {
    jobId: "123e4567-e89b-42d3-a456-426614174000",
    description: "Replaced faulty float valve assembly",
    costEstimate: 450,
    photoUrl: null,
  };

  it("passes for valid input", () => {
    const result = validateVariationInput(valid);
    expect(result.success).toBe(true);
  });

  it("fails when description is shorter than 10 characters (VC-02)", () => {
    const result = validateVariationInput({ ...valid, description: "Too short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("description");
    }
  });

  it("fails when costEstimate is zero (VC-03)", () => {
    const result = validateVariationInput({ ...valid, costEstimate: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("costEstimate");
    }
  });

  it("fails when costEstimate is negative (VC-03)", () => {
    const result = validateVariationInput({ ...valid, costEstimate: -50 });
    expect(result.success).toBe(false);
  });

  it("accepts a valid photoUrl", () => {
    const result = validateVariationInput({
      ...valid,
      photoUrl: "https://example.blob.vercel-storage.com/photo.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null photoUrl", () => {
    const result = validateVariationInput({ ...valid, photoUrl: null });
    expect(result.success).toBe(true);
  });
});
