import { describe, expect, it, vi } from "vitest";

import {
  rankDatafnPlacementRegions,
  readDatafnCloudflarePlacementLocation,
  selectDatafnPlacementRegion,
  type DatafnPlacementRegionCandidate,
} from "./placement-policy.js";

const regions: readonly DatafnPlacementRegionCandidate[] = [
  { regionId: "in-south", latitude: 19.076, longitude: 72.8777 },
  { regionId: "us-east", latitude: 39.0438, longitude: -77.4874 },
  { regionId: "eu-west", latitude: 53.3498, longitude: -6.2603 },
];

function cloudflareRequest(cf: Record<string, unknown>): Request {
  return Object.assign(new Request("https://data.example/datafn/query"), {
    cf,
  });
}

describe("DataFn placement policy", () => {
  it.each([
    ["Mumbai", 19.076, 72.8777, "in-south"],
    ["New York", 40.7128, -74.006, "us-east"],
    ["Paris", 48.8566, 2.3522, "eu-west"],
  ])(
    "selects the nearest eligible region to %s",
    (_name, latitude, longitude, expected) => {
      expect(
        selectDatafnPlacementRegion({
          candidates: regions,
          location: { latitude, longitude },
        }),
      ).toMatchObject({ regionId: expected, source: "coordinates" });
    },
  );

  it.each([
    ["AS", "in-south"],
    ["EU", "eu-west"],
    ["NA", "us-east"],
  ])(
    "uses the %s continent center when coordinates are unavailable",
    (continent, expected) => {
      expect(
        selectDatafnPlacementRegion({
          candidates: regions,
          location: { continent },
        }),
      ).toMatchObject({ regionId: expected, source: "continent" });
    },
  );

  it("honors an eligible explicit preference before geography", () => {
    expect(
      selectDatafnPlacementRegion({
        candidates: regions,
        preferredRegionId: "eu-west",
        location: { latitude: 19.076, longitude: 72.8777 },
      }),
    ).toEqual({ regionId: "eu-west", source: "preferred" });
  });

  it("lets products supply residency, health, and capacity constraints", () => {
    const constraint = vi.fn(
      (candidate: DatafnPlacementRegionCandidate) =>
        candidate.regionId !== "in-south",
    );
    expect(
      selectDatafnPlacementRegion({
        candidates: regions,
        preferredRegionId: "in-south",
        location: { latitude: 19.076, longitude: 72.8777 },
        constraints: [constraint],
      }),
    ).toMatchObject({ regionId: "eu-west", source: "coordinates" });
    expect(constraint).toHaveBeenCalledTimes(regions.length);
  });

  it("ranks by distance with a deterministic region-ID tie-breaker", () => {
    const ranked = rankDatafnPlacementRegions({
      candidates: [
        { regionId: "region-b", latitude: 10, longitude: 10 },
        { regionId: "region-a", latitude: 10, longitude: 10 },
      ],
      location: { latitude: 10, longitude: 10 },
    });
    expect(ranked.map((decision) => decision.regionId)).toEqual([
      "region-a",
      "region-b",
    ]);
    expect(ranked[0]).toMatchObject({
      source: "coordinates",
      distanceKilometers: 0,
    });
  });

  it("keeps antipodal distances finite when floating-point error exceeds one", () => {
    const ranked = rankDatafnPlacementRegions({
      candidates: [
        { regionId: "antipodal", latitude: -58, longitude: -48 },
        { regionId: "nearer", latitude: 0, longitude: 0 },
      ],
      location: { latitude: 58, longitude: 132 },
    });
    expect(ranked.map((decision) => decision.regionId)).toEqual([
      "nearer",
      "antipodal",
    ]);
    expect(
      ranked.every((decision) => Number.isFinite(decision.distanceKilometers)),
    ).toBe(true);
  });

  it("uses stable fallback only when a caller explicitly supplies a key", () => {
    const withoutFallback = selectDatafnPlacementRegion({
      candidates: regions,
    });
    const first = selectDatafnPlacementRegion({
      candidates: regions,
      stableKey: "tenant:stable",
    });
    const reordered = selectDatafnPlacementRegion({
      candidates: [...regions].reverse(),
      stableKey: "tenant:stable",
    });
    expect(withoutFallback).toBeNull();
    expect(first).toEqual(reordered);
    expect(first?.source).toBe("stable-fallback");
  });

  it("rejects ambiguous or empty region identifiers", () => {
    expect(() =>
      selectDatafnPlacementRegion({
        candidates: [{ regionId: "eu" }, { regionId: "eu" }],
        stableKey: "tenant",
      }),
    ).toThrow("DATAFN_PLACEMENT_REGION_DUPLICATE: eu");
    expect(() =>
      selectDatafnPlacementRegion({
        candidates: [{ regionId: "  " }],
        stableKey: "tenant",
      }),
    ).toThrow("DATAFN_PLACEMENT_REGION_ID_REQUIRED");
  });

  it("normalizes trusted Cloudflare coordinates and continent metadata", () => {
    expect(
      readDatafnCloudflarePlacementLocation(
        cloudflareRequest({
          latitude: "19.076",
          longitude: "72.8777",
          continent: "as",
        }),
      ),
    ).toEqual({ latitude: 19.076, longitude: 72.8777, continent: "AS" });
    expect(
      readDatafnCloudflarePlacementLocation(
        cloudflareRequest({ latitude: "invalid", longitude: 200 }),
      ),
    ).toBeNull();
  });
});
