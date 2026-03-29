import { source } from "@/lib/source";
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Mermaid } from "@/components/mdx/mermaid";
import type { ComponentType } from "react";
import { LLMCopyButton, ViewOptions } from '@/components/ai/page-actions';
import { gitConfig } from "@/app/layout.config";

type LoadedDocsPageData = {
  body: ComponentType<{ components?: Record<string, unknown> }>;
  description?: string;
  full?: boolean;
  title: string;
  toc?: unknown;
};

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const data = page.data as typeof page.data & LoadedDocsPageData;
  const { body: MDX, description, full, title } = data;
  const toc = Array.isArray(data.toc) ? data.toc : [];
  const rawMarkdownUrl = `/api/docs/raw/${page.path}`;

  return (
    <DocsPage
      toc={toc}
      full={full}
      editOnGithub={{
        owner: gitConfig.user,
        repo: gitConfig.repo,
        path: `datafn/docs/content/docs/${page.path}`,
        sha: gitConfig.branch,
      }}
    >
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription className="mb-0">{description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <LLMCopyButton markdownUrl={rawMarkdownUrl} />
        <ViewOptions
          markdownUrl={rawMarkdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/datafn/docs/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX components={{ ...defaultMdxComponents, Mermaid }} />
      </DocsBody>
    </DocsPage>
  );
}
