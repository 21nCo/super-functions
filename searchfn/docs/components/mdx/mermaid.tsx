'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '-');
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string>('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram(): Promise<void> {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          fontFamily: 'inherit',
          themeCSS: 'margin: 1.5rem auto 0;',
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        });

        const rendered = await mermaid.render(`mermaid-${id}`, chart.replaceAll('\\n', '\n'));
        if (!cancelled) {
          bindFunctionsRef.current = rendered.bindFunctions;
          setSvg(rendered.svg);
        }
      } catch {
        if (!cancelled) {
          bindFunctionsRef.current = undefined;
          setSvg('');
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  useEffect(() => {
    if (!svg || !containerRef.current || !bindFunctionsRef.current) {
      return;
    }
    bindFunctionsRef.current(containerRef.current);
  }, [svg]);

  if (!svg) {
    return null;
  }

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}
