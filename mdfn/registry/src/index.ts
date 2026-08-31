import { resolveExtensions, type MdfnExtension, type ResolvedExtensionRegistry } from "@mdfn/core";

export interface MdfnProfile {
  readonly name: string;
  readonly version: string;
  readonly extensions: readonly string[];
  readonly description?: string;
  readonly rawHtml?: "disabled" | "sanitized";
}

export interface ResolvedMdfnProfile extends MdfnProfile {
  readonly registry: ResolvedExtensionRegistry;
}

export interface MdfnRegistry {
  registerExtension(extension: MdfnExtension): void;
  registerProfile(profile: MdfnProfile): void;
  extension(name: string): MdfnExtension | undefined;
  profile(name: string): ResolvedMdfnProfile;
  listExtensions(): readonly MdfnExtension[];
  listProfiles(): readonly MdfnProfile[];
}

export function createRegistry(input: { readonly extensions?: readonly MdfnExtension[]; readonly profiles?: readonly MdfnProfile[] } = {}): MdfnRegistry {
  const extensions = new Map<string, MdfnExtension>();
  const profiles = new Map<string, MdfnProfile>();
  const registerExtension = (extension: MdfnExtension): void => {
    if (extensions.has(extension.name)) throw new Error(`MDFN_REGISTRY_EXTENSION_EXISTS:${extension.name}`);
    // Resolve a complete temporary set so dependency and security policy errors surface at registration time.
    resolveExtensions([...extensions.values(), extension]);
    extensions.set(extension.name, extension);
  };
  for (const extension of resolveExtensions(input.extensions ?? []).extensions) extensions.set(extension.name, extension);
  const registerProfile = (profile: MdfnProfile): void => {
    if (!profile.name || !profile.version) throw new Error("MDFN_REGISTRY_PROFILE_INVALID");
    if (profiles.has(profile.name)) throw new Error(`MDFN_REGISTRY_PROFILE_EXISTS:${profile.name}`);
    for (const name of profile.extensions) if (!extensions.has(name)) throw new Error(`MDFN_REGISTRY_PROFILE_EXTENSION_MISSING:${name}`);
    profiles.set(profile.name, Object.freeze({ ...profile, extensions: Object.freeze([...profile.extensions]) }));
  };
  for (const profile of input.profiles ?? []) registerProfile(profile);
  return {
    registerExtension,
    registerProfile,
    extension: (name) => extensions.get(name),
    profile(name) {
      const profile = profiles.get(name);
      if (!profile) throw new Error(`MDFN_REGISTRY_PROFILE_MISSING:${name}`);
      const selected = new Map<string, MdfnExtension>();
      const include = (extensionName: string): void => {
        if (selected.has(extensionName)) return;
        const extension = extensions.get(extensionName);
        if (!extension) throw new Error(`MDFN_REGISTRY_PROFILE_EXTENSION_MISSING:${extensionName}`);
        for (const dependency of extension.dependencies ?? []) include(dependency);
        selected.set(extensionName, extension);
      };
      for (const extension of profile.extensions) include(extension);
      return { ...profile, registry: resolveExtensions([...selected.values()]) };
    },
    listExtensions: () => Object.freeze([...extensions.values()]),
    listProfiles: () => Object.freeze([...profiles.values()]),
  };
}

export const MDFN_REGISTRY_VERSION = "0.1.0" as const;
