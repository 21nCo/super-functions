export interface DatafnPlacementRegionCandidate {
  readonly regionId: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface DatafnPlacementLocation {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly continent?: string;
}

export interface DatafnPlacementConstraintContext {
  readonly location: DatafnPlacementLocation | null;
  readonly preferredRegionId: string | null;
}

export type DatafnPlacementConstraint = (
  candidate: DatafnPlacementRegionCandidate,
  context: DatafnPlacementConstraintContext,
) => boolean;

export type DatafnPlacementDecisionSource =
  "preferred" | "coordinates" | "continent" | "stable-fallback";

export interface DatafnPlacementDecision {
  readonly regionId: string;
  readonly source: DatafnPlacementDecisionSource;
  readonly distanceKilometers?: number;
}

export interface DatafnPlacementRankingInput {
  readonly candidates: readonly DatafnPlacementRegionCandidate[];
  readonly location?: DatafnPlacementLocation | null;
  readonly preferredRegionId?: string | null;
  readonly constraints?: readonly DatafnPlacementConstraint[];
}

export interface DatafnPlacementSelectionInput extends DatafnPlacementRankingInput {
  /**
   * Optional stable key used only when neither a preferred region nor trusted
   * geographic signal can select an eligible region.
   */
  readonly stableKey?: string;
}

const CONTINENT_CENTERS: Readonly<Record<string, readonly [number, number]>> = {
  AF: [1.65, 17.68],
  AN: [-82.86, 135],
  AS: [34.05, 100.62],
  EU: [54.53, 15.26],
  NA: [54.53, -105.26],
  OC: [-22.74, 140.02],
  SA: [-14.24, -51.93],
};

function finiteCoordinate(
  value: number | undefined,
  minimum: number,
  maximum: number,
): value is number {
  return (
    value !== undefined &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function normalizedCandidates(
  input: DatafnPlacementRankingInput,
): readonly DatafnPlacementRegionCandidate[] {
  const context: DatafnPlacementConstraintContext = {
    location: input.location ?? null,
    preferredRegionId: input.preferredRegionId ?? null,
  };
  const seen = new Set<string>();
  const candidates = input.candidates.map((candidate) => {
    const regionId = candidate.regionId.trim();
    if (!regionId) throw new Error("DATAFN_PLACEMENT_REGION_ID_REQUIRED");
    if (seen.has(regionId)) {
      throw new Error(`DATAFN_PLACEMENT_REGION_DUPLICATE: ${regionId}`);
    }
    seen.add(regionId);
    return regionId === candidate.regionId
      ? candidate
      : { ...candidate, regionId };
  });
  return candidates.filter((candidate) =>
    (input.constraints ?? []).every((constraint) =>
      constraint(candidate, context),
    ),
  );
}

function sourceCoordinates(location: DatafnPlacementLocation | null): {
  readonly coordinates: readonly [number, number];
  readonly source: "coordinates" | "continent";
} | null {
  if (!location) return null;
  if (
    finiteCoordinate(location.latitude, -90, 90) &&
    finiteCoordinate(location.longitude, -180, 180)
  ) {
    return {
      coordinates: [location.latitude, location.longitude],
      source: "coordinates",
    };
  }
  const continent = location.continent?.toUpperCase();
  const coordinates = continent ? CONTINENT_CENTERS[continent] : undefined;
  return coordinates ? { coordinates, source: "continent" } : null;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceKilometers(
  source: readonly [number, number],
  target: readonly [number, number],
): number {
  const sourceLatitude = radians(source[0]);
  const targetLatitude = radians(target[0]);
  const latitudeDelta = radians(target[0] - source[0]);
  const longitudeDelta = radians(target[1] - source[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(sourceLatitude) *
      Math.cos(targetLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const clampedHaversine = Math.min(1, Math.max(0, haversine));
  return (
    6_371 *
    2 *
    Math.atan2(Math.sqrt(clampedHaversine), Math.sqrt(1 - clampedHaversine))
  );
}

/**
 * Ranks eligible regions by physical distance from a trusted client signal.
 * Region ID is the deterministic tie-breaker.
 */
export function rankDatafnPlacementRegions(
  input: DatafnPlacementRankingInput,
): readonly DatafnPlacementDecision[] {
  const candidates = normalizedCandidates(input);
  const source = sourceCoordinates(input.location ?? null);
  if (!source) return [];
  return candidates
    .flatMap((candidate) => {
      const { latitude, longitude } = candidate;
      return finiteCoordinate(latitude, -90, 90) &&
        finiteCoordinate(longitude, -180, 180)
        ? [
            {
              regionId: candidate.regionId,
              source: source.source,
              distanceKilometers: distanceKilometers(source.coordinates, [
                latitude,
                longitude,
              ]),
            } satisfies DatafnPlacementDecision,
          ]
        : [];
    })
    .sort(
      (left, right) =>
        (left.distanceKilometers ?? 0) - (right.distanceKilometers ?? 0) ||
        left.regionId.localeCompare(right.regionId),
    );
}

function stableIndex(key: string, length: number): number {
  let hash = 2_166_136_261;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash % length;
}

/**
 * Selects an eligible region using explicit choice, trusted geography, then an
 * opt-in stable fallback. Product residency, health, and capacity policy is
 * supplied through constraints rather than embedded in DataFn.
 */
export function selectDatafnPlacementRegion(
  input: DatafnPlacementSelectionInput,
): DatafnPlacementDecision | null {
  const candidates = normalizedCandidates(input);
  const preferredRegionId = input.preferredRegionId?.trim();
  if (
    preferredRegionId &&
    candidates.some((candidate) => candidate.regionId === preferredRegionId)
  ) {
    return { regionId: preferredRegionId, source: "preferred" };
  }

  const ranked = rankDatafnPlacementRegions({
    candidates,
    location: input.location ?? null,
  });
  const nearest = ranked[0];
  if (nearest) return nearest;

  if (input.stableKey !== undefined && candidates.length > 0) {
    const stableCandidates = [...candidates].sort((left, right) =>
      left.regionId.localeCompare(right.regionId),
    );
    const selected =
      stableCandidates[stableIndex(input.stableKey, stableCandidates.length)];
    if (selected) {
      return { regionId: selected.regionId, source: "stable-fallback" };
    }
  }
  return null;
}

interface CloudflareLocationRequest extends Request {
  readonly cf?: {
    readonly continent?: unknown;
    readonly latitude?: unknown;
    readonly longitude?: unknown;
  };
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

/** Reads Cloudflare's trusted request.cf location without requiring Workers types. */
export function readDatafnCloudflarePlacementLocation(
  request: Request,
): DatafnPlacementLocation | null {
  const cf = (request as CloudflareLocationRequest).cf;
  if (!cf) return null;
  const latitude = coordinate(cf.latitude, -90, 90);
  const longitude = coordinate(cf.longitude, -180, 180);
  const continent =
    typeof cf.continent === "string" && /^[A-Za-z]{2}$/u.test(cf.continent)
      ? cf.continent.toUpperCase()
      : undefined;
  if (latitude === undefined && longitude === undefined && !continent)
    return null;
  return {
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    ...(continent ? { continent } : {}),
  };
}
