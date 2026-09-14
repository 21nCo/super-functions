import React from "react";
import { compileReactContent, resolveMarkdownRelativeLinks } from "@docsfn/core/browser";
import type { CompiledContentArtifact, DocHeading, DocsCompatPreset } from "@docsfn/core";
import { DocsContent } from "./DocsContent";

export interface EmbeddedPageModel {
  path?: string;
  id?: string;
  title: string;
  description?: string;
  body: string;
  headings?: DocHeading[];
}

export interface EmbeddedPageProps {
  page: EmbeddedPageModel;
  compiled?: CompiledContentArtifact;
  compatPreset?: DocsCompatPreset;
  components?: Record<string, React.ComponentType<{ children?: React.ReactNode }>>;
  showToc?: boolean;
  tocLabel?: string;
  pageActionsSlot?: React.ReactNode;
}

export function EmbeddedPage({
  page,
  compiled,
  compatPreset = "none",
  components,
  showToc = true,
  tocLabel = "On this page",
  pageActionsSlot,
}: EmbeddedPageProps) {
  const headings = page.headings ?? [];
  const resolved = React.useMemo(() => page.path ? resolveMarkdownRelativeLinks({ compiled: compiled ?? compileReactContent({ source: page.body, sourcePath: page.id, compatPreset }), route: page.path, sourcePath: page.id }) : compiled, [compiled, page.path, page.id, page.body, compatPreset]);

  return (
    <article className="docsfn-embedded-page" data-docsfn-embedded-page="true">
      <header className="docsfn-embedded-page-header">
        <h1>{page.title}</h1>
        {page.description ? <p>{page.description}</p> : null}
      </header>

      {showToc && headings.length > 0 ? (
        <nav aria-label={tocLabel} className="docsfn-embedded-page-toc">
          <h2>{tocLabel}</h2>
          <ol>
            {headings.map((heading) => (
              <li key={heading.slug}>
                <a href={`#${heading.slug}`}>{heading.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <DocsContent
        compiled={resolved}
        content={page.body}
        sourcePath={page.id}
        compatPreset={compatPreset}
        components={components}
        pageActionsSlot={pageActionsSlot}
      />
    </article>
  );
}
