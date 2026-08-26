"use client";

import { useEffect, useState } from "react";
import { App } from "../../../examples/react-workbench/src/main";

export default function CatalogClient() {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  if (!ready) {
    return <main className="workbench-main">Loading the React catalog…</main>;
  }

  return <App basePath="/components/react" />;
}
