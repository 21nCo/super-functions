import * as React from "react";
import { createRoot } from "react-dom/client";
import { MdfnEditorShell } from "@mdfn/components-react";
import "@uifn/components/styles.css";
import "@mdfn/components/styles.css";
import "../../shared.css";
import { createExampleController, markdownForFiles, resetExample, type ExampleMode } from "../../shared";

const controller = createExampleController();
const destroyOnPageHide = (event: PageTransitionEvent): void => {
  if (event.persisted) return;
  controller.destroy();
  window.removeEventListener("pagehide", destroyOnPageHide);
};
window.addEventListener("pagehide", destroyOnPageHide);

function App(): React.ReactElement {
  const [mode, setMode] = React.useState<ExampleMode>("visual");
  const [markdown, setMarkdown] = React.useState(() => controller.getState().markdown);
  const [status, setStatus] = React.useState("loading");

  React.useEffect(() => {
    const unsubscribe = controller.subscribe((change) => setMarkdown(change.current.markdown));
    return unsubscribe;
  }, []);

  const handleReady = React.useCallback(() => setStatus("ready"), []);
  const handleLoadError = React.useCallback(() => setStatus("error"), []);

  return (
    <main className="example-app" data-example-framework="react">
      <header className="example-hero">
        <div>
          <p className="example-kicker">MDFN · React</p>
          <h1>Source-first authoring, at home in React.</h1>
          <p className="example-intro">A complete editor shell with visual and source modes, preview, formatting, files, comments, review state, history, and diagnostics.</p>
        </div>
        <dl className="example-meta">
          <div><dt>Runtime</dt><dd>React 18</dd></div>
          <div><dt>Mode</dt><dd data-example-mode>{mode}</dd></div>
          <div><dt>Characters</dt><dd data-example-characters>{markdown.length}</dd></div>
          <div><dt>Editor</dt><dd className="example-status" data-example-status>{status}</dd></div>
        </dl>
      </header>

      <section className="example-workspace" aria-label="React Markdown workspace">
        <div className="example-workspace-header">
          <p className="example-document-name">product-launch.md</p>
          <button className="example-reset" type="button" aria-label="Reset example document" onClick={() => resetExample(controller)}>Reset document</button>
        </div>
        <MdfnEditorShell
          controller={controller}
          mode={mode}
          ariaLabel="MDFN React example editor"
          actor={{ id: "react-example-author" }}
          onModeChange={(next) => { if (next) setMode(next); }}
          onSelectFiles={markdownForFiles}
          onReady={handleReady}
          onLoadError={handleLoadError}
        />
      </section>

      <aside className="example-source-card" aria-label="Live Markdown source">
        <div><h2>Live Markdown</h2><p>The same authoritative source updates as you work in any editor mode.</p></div>
        <pre className="example-source" data-example-markdown>{markdown}</pre>
      </aside>
    </main>
  );
}

createRoot(document.querySelector<HTMLElement>("#app")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
