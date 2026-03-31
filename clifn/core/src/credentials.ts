import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import ini from "ini";

export interface CredentialProfile {
  backend: string;
  key: string;
}

export interface CredentialStore {
  readonly path: string;
  getProfile(name: string): CredentialProfile;
  setProfile(name: string, profile: CredentialProfile): void;
  hasProfile(name: string): boolean;
  listProfiles(): string[];
  removeProfile(name: string): void;
}

export class MissingProfileError extends Error {
  readonly profile: string;
  readonly filePath: string;
  readonly code = "CLIFN_MISSING_PROFILE";

  constructor(profile: string, filePath: string) {
    super(`Profile "${profile}" was not found in credentials file: ${filePath}`);
    this.name = "MissingProfileError";
    this.profile = profile;
    this.filePath = filePath;
  }
}

const DEFAULT_CREDENTIALS_PATH = join(homedir(), ".conduct", "credentials");

function readProfiles(path: string): Record<string, CredentialProfile> {
  if (!existsSync(path)) {
    return {};
  }

  const raw = readFileSync(path, "utf8");
  const parsed = ini.parse(raw) as Record<string, unknown>;
  const out: Record<string, CredentialProfile> = {};

  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.backend === "string" && typeof candidate.key === "string") {
      out[name] = {
        backend: candidate.backend,
        key: candidate.key,
      };
    }
  }

  return out;
}

function writeProfiles(path: string, profiles: Record<string, CredentialProfile>): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const serialized = ini.stringify(profiles);
  writeFileSync(path, serialized, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function createCredentialStore(path = DEFAULT_CREDENTIALS_PATH): CredentialStore {
  return {
    path,
    getProfile(name: string): CredentialProfile {
      const profiles = readProfiles(path);
      const profile = profiles[name];
      if (!profile) {
        throw new MissingProfileError(name, path);
      }
      return profile;
    },
    setProfile(name: string, profile: CredentialProfile): void {
      const profiles = readProfiles(path);
      profiles[name] = profile;
      writeProfiles(path, profiles);
    },
    hasProfile(name: string): boolean {
      const profiles = readProfiles(path);
      return Boolean(profiles[name]);
    },
    listProfiles(): string[] {
      const profiles = readProfiles(path);
      return Object.keys(profiles);
    },
    removeProfile(name: string): void {
      const profiles = readProfiles(path);
      if (!profiles[name]) {
        return;
      }
      delete profiles[name];
      writeProfiles(path, profiles);
    },
  };
}
