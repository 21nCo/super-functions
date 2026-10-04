export type DocsGitConfig = {
  user: string;
  repo: string;
  branch: string;
};

export type DocsBaseLayoutProps = {
  nav?: {
    title?: string;
    url?: string;
  };
  githubUrl?: string;
};

/**
 * Create independent navigation options for a docs app.
 * The docs link defaults to `/docs`; branch names are encoded as one URL segment.
 */
export function createBaseLayoutOptions(
  title: string,
  gitConfig: DocsGitConfig,
  docsUrl = "/docs",
): DocsBaseLayoutProps {
  return {
    nav: {
      title,
      url: docsUrl,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/${encodeURIComponent(gitConfig.branch)}`,
  };
}
