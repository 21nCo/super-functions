import { createSignal, onCleanup, type Component } from "solid-js";
import { render } from "solid-js/web";
import { MdfnEditorShell } from "@mdfn/components-solid";
import "@uifn/components/styles.css";
import "@mdfn/components/styles.css";
import "../../shared.css";
import { createExampleController, markdownForFiles, resetExample, type ExampleMode } from "../../shared";

const App: Component = () => {
  const controller = createExampleController();
  const [mode, setMode] = createSignal<ExampleMode>("visual");
  const [markdown, setMarkdown] = createSignal(controller.getState().markdown);
  const [status, setStatus] = createSignal("loading");
  const unsubscribe = controller.subscribe((change) => setMarkdown(change.current.markdown));
  onCleanup(() => {
    unsubscribe();
    controller.destroy();
  });

  return <main class="example-app" data-example-framework="solid">
    <header class="example-hero">
      <div>
        <p class="example-kicker">MDFN · Solid</p>
        <h1>Source-first authoring, at home in Solid.</h1>
        <p class="example-intro">A complete editor shell with visual and source modes, preview, formatting, files, comments, review state, history, and diagnostics.</p>
      </div>
      <dl class="example-meta">
        <div><dt>Runtime</dt><dd>Solid 1</dd></div>
        <div><dt>Mode</dt><dd data-example-mode>{mode()}</dd></div>
        <div><dt>Characters</dt><dd data-example-characters>{markdown().length}</dd></div>
        <div><dt>Editor</dt><dd class="example-status" data-example-status>{status()}</dd></div>
      </dl>
    </header>

    <section class="example-workspace" aria-label="Solid Markdown workspace">
      <div class="example-workspace-header">
        <p class="example-document-name">product-launch.md</p>
        <button class="example-reset" type="button" aria-label="Reset example document" onClick={() => resetExample(controller)}>Reset document</button>
      </div>
      <MdfnEditorShell
        controller={controller}
        mode={mode()}
        ariaLabel="MDFN Solid example editor"
        actor={{ id: "solid-example-author" }}
        onModeChange={setMode}
        onSelectFiles={markdownForFiles}
        editorRef={(editor) => setStatus(editor ? "ready" : "loading")}
        onLoadError={() => setStatus("error")}
      />
    </section>

    <aside class="example-source-card" aria-label="Live Markdown source">
      <div><h2>Live Markdown</h2><p>The same authoritative source updates as you work in any editor mode.</p></div>
      <pre class="example-source" data-example-markdown>{markdown()}</pre>
    </aside>
  </main>;
};

render(() => <App />, document.querySelector<HTMLElement>("#app")!);
