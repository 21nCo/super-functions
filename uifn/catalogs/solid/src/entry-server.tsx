import { createHandler, StartServer } from "@solidjs/start/server";

function Document(props: { assets: unknown; children: unknown; scripts: unknown }) {
  return (
    <html lang="en">
      <head>
        <title>uifn Solid component catalog</title>
        <meta
          name="description"
          content="Actual uifn Solid components and behavior rendered through SolidStart."
        />
        {props.assets as never}
      </head>
      <body>
        <div id="app">{props.children as never}</div>
        {props.scripts as never}
      </body>
    </html>
  );
}

export default createHandler(() => <StartServer document={Document} />);
