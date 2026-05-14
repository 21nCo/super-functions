import path from 'node:path';

import type {
  BrowserTarget,
  ManifestOverride,
  ResolvedContentScriptConfig,
  ResolvedExtensionConfig,
  ResolvedPageSurface,
} from 'extfn';

import { applyChromiumTargetManifest } from '../targets/chromium.js';
import { applyFirefoxTargetManifest } from '../targets/firefox.js';
import { mergeManifest } from './mergeManifest.js';

export interface TargetBuildOutputs {
  background: string;
  pages: Partial<Record<ResolvedPageSurface['surface'], string>>;
  contentScripts: Record<
    string,
    {
      js: string;
      css: readonly string[];
    }
  >;
}

export function buildManifest(
  resolvedConfig: ResolvedExtensionConfig,
  target: BrowserTarget,
  outputs: TargetBuildOutputs
): Record<string, unknown> {
  const baseManifest = {
    manifest_version: 3,
    name: resolvedConfig.config.name,
    version: resolvedConfig.config.version,
    ...(resolvedConfig.config.description
      ? { description: resolvedConfig.config.description }
      : {}),
    background: {
      service_worker: outputs.background,
      type: 'module',
    },
  } satisfies Record<string, unknown>;

  const surfaceManifest = buildSurfaceManifest(
    resolvedConfig.surfaces.filter((surface) => surface.targets.includes(target)),
    outputs.pages
  );

  const contentManifest = buildContentScriptsManifest(
    resolvedConfig.contentScripts.filter(
      (contentScript) => !contentScript.targets || contentScript.targets.includes(target)
    ),
    outputs.contentScripts
  );

  const merged = mergeManifest(
    baseManifest,
    surfaceManifest,
    contentManifest,
    collectSurfaceOverrides(resolvedConfig, target),
    resolvedConfig.config.manifest
  );

  if (target === 'chromium-mv3') {
    return applyChromiumTargetManifest(merged);
  }

  return applyFirefoxTargetManifest(merged);
}

export function createTargetBuildOutputs(
  resolvedConfig: ResolvedExtensionConfig
): TargetBuildOutputs {
  const pages = Object.fromEntries(
    resolvedConfig.surfaces.map((surface) => [surface.surface, surface.outputPath])
  ) as Partial<Record<ResolvedPageSurface['surface'], string>>;

  const contentScripts = Object.fromEntries(
    resolvedConfig.contentScripts.map((contentScript) => [
      contentScript.id,
      {
        js: `content/${contentScript.id}.js`,
        css: contentScript.resolvedCss.map((cssPath) =>
          path.posix.join('content', contentScript.id, path.basename(cssPath))
        ),
      },
    ])
  );

  return {
    background: 'background.js',
    pages,
    contentScripts,
  };
}

function buildSurfaceManifest(
  surfaces: readonly ResolvedPageSurface[],
  pages: Partial<Record<ResolvedPageSurface['surface'], string>>
): Record<string, unknown> {
  const manifest: Record<string, unknown> = {};

  for (const surface of surfaces) {
    const outputPath = pages[surface.surface];
    if (!outputPath) {
      continue;
    }

    if (surface.surface === 'popup') {
      manifest.action = {
        default_popup: outputPath,
        ...(surface.title ? { default_title: surface.title } : {}),
      };
    } else if (surface.surface === 'options') {
      manifest.options_ui = {
        page: outputPath,
        open_in_tab: true,
      };
    } else if (surface.surface === 'sidepanel') {
      manifest.side_panel = {
        default_path: outputPath,
      };
    }
  }

  return manifest;
}

function buildContentScriptsManifest(
  contentScripts: readonly ResolvedContentScriptConfig[],
  outputs: TargetBuildOutputs['contentScripts']
): Record<string, unknown> {
  if (contentScripts.length === 0) {
    return {};
  }

  return {
    content_scripts: contentScripts
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((contentScript) => {
        const output = outputs[contentScript.id];
        const manifestEntry: Record<string, unknown> = {
          matches: [...contentScript.matches],
          js: [output.js],
        };

        if (contentScript.excludeMatches?.length) {
          manifestEntry.exclude_matches = [...contentScript.excludeMatches];
        }

        if (output.css.length > 0) {
          manifestEntry.css = [...output.css];
        }

        if (contentScript.runAt) {
          manifestEntry.run_at = contentScript.runAt;
        }

        if (contentScript.allFrames !== undefined) {
          manifestEntry.all_frames = contentScript.allFrames;
        }

        if (contentScript.world) {
          manifestEntry.world = contentScript.world;
        }

        return manifestEntry;
      }),
  };
}

function collectSurfaceOverrides(
  resolvedConfig: ResolvedExtensionConfig,
  target: BrowserTarget
): Record<string, unknown> | undefined {
  const overrides: ManifestOverride[] = [];

  for (const surface of resolvedConfig.surfaces) {
    if (!surface.targets.includes(target)) {
      continue;
    }

    const declaration = resolvedConfig.config[surface.surface];
    if (declaration?.manifest) {
      overrides.push(declaration.manifest);
    }
  }

  if (overrides.length === 0) {
    return undefined;
  }

  return mergeManifest(...overrides);
}
