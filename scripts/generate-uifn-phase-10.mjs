#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const mode = process.argv.includes("--write")
  ? "write"
  : process.argv.includes("--check")
    ? "check"
    : null;
if (!mode) {
  console.error(
    "Usage: node scripts/generate-uifn-phase-10.mjs (--write|--check)",
  );
  process.exit(2);
}

const outputRoot = path.resolve(process.cwd(), "uifn/.conduct/generated/phase-10");
const catalogPrimitiveCount = JSON.parse(
  await readFile(
    path.resolve(process.cwd(), "uifn/catalog/generated/catalog.json"),
    "utf8",
  ),
).primitives.length;
const primitives = [
  {
    name: "AngleSlider",
    requirement: "PRIM-006",
    kind: "interactive-controller",
    factory: "createAngleSliderController",
    parts: ["root", "track", "thumb", "valueText", "hiddenInput"],
  },
  {
    name: "Carousel",
    requirement: "PRIM-006",
    kind: "interactive-controller",
    factory: "createCarouselController",
    parts: [
      "root",
      "viewport",
      "item",
      "previous",
      "next",
      "indicatorGroup",
      "indicator",
      "liveRegion",
    ],
  },
  {
    name: "ColorPicker",
    requirement: "PRIM-007",
    kind: "interactive-controller",
    factory: "createColorPickerController",
    parts: [
      "root",
      "label",
      "control",
      "trigger",
      "positioner",
      "content",
      "area",
      "areaThumb",
      "channelSlider",
      "channelInput",
      "swatch",
      "hiddenInput",
    ],
  },
  {
    name: "DateInput",
    requirement: "PRIM-007",
    kind: "interactive-controller",
    factory: "createDateInputController",
    parts: ["root", "label", "segment", "hiddenInput", "error"],
  },
  {
    name: "DatePicker",
    requirement: "PRIM-007",
    kind: "interactive-controller",
    factory: "createDatePickerController",
    parts: [
      "root",
      "label",
      "input",
      "segment",
      "trigger",
      "positioner",
      "content",
      "header",
      "previous",
      "next",
      "grid",
      "gridLabel",
      "cell",
      "cellTrigger",
      "hiddenInput",
    ],
  },
  {
    name: "Meter",
    requirement: "PRIM-008",
    kind: "typed-static-contract",
    contract: "MeterContract",
    parts: ["root", "label", "track", "range", "valueText"],
  },
  {
    name: "Progress",
    requirement: "PRIM-008",
    kind: "typed-static-contract",
    contract: "ProgressContract",
    parts: ["root", "label", "track", "range", "circle", "valueText"],
  },
  {
    name: "RatingGroup",
    requirement: "PRIM-006",
    kind: "interactive-controller",
    factory: "createRatingGroupController",
    parts: [
      "root",
      "label",
      "control",
      "item",
      "itemIndicator",
      "hiddenInput",
      "valueText",
    ],
  },
  {
    name: "SignaturePad",
    requirement: "PRIM-006",
    kind: "interactive-controller",
    factory: "createSignaturePadController",
    parts: [
      "root",
      "label",
      "canvas",
      "clear",
      "undo",
      "status",
      "hiddenInput",
    ],
  },
  {
    name: "Slider",
    requirement: "PRIM-006",
    kind: "interactive-controller",
    factory: "createSliderController",
    parts: [
      "root",
      "label",
      "control",
      "track",
      "range",
      "thumb",
      "valueText",
      "hiddenInput",
    ],
  },
  {
    name: "Splitter",
    requirement: "PRIM-006",
    kind: "interactive-controller",
    factory: "createSplitterController",
    parts: ["root", "panel", "resizeTrigger", "resizeHandle"],
  },
  {
    name: "Steps",
    requirement: "PRIM-008",
    kind: "interactive-controller",
    factory: "createStepsController",
    parts: [
      "root",
      "list",
      "item",
      "trigger",
      "indicator",
      "separator",
      "content",
      "completed",
    ],
  },
  {
    name: "Timer",
    requirement: "PRIM-007",
    kind: "interactive-controller",
    factory: "createTimerController",
    parts: ["root", "value", "start", "pause", "reset", "status"],
  },
  {
    name: "Toast",
    requirement: "PRIM-008",
    kind: "interactive-controller",
    factory: "createToastController",
    parts: ["viewport", "root", "title", "description", "action", "close"],
  },
];
const contracts = {
  gesture: [
    "pointer-capture",
    "pointer-cancel",
    "lost-pointer-capture",
    "touch-axis-arbitration",
    "multi-pointer",
    "multi-thumb",
    "keyboard-precision",
    "orientation",
    "rtl",
    "zoom",
    "reduced-motion",
  ],
  structuredValues: [
    "calendar-date",
    "explicit-time-zone",
    "dst-gap",
    "dst-fold",
    "locale-calendar",
    "availability",
    "srgb",
    "hsl",
    "alpha-round-trip",
    "injected-clock",
    "visibility-pause",
    "clock-derived-elapsed-time",
  ],
  feedback: [
    "native-meter-progress",
    "workflow-status",
    "toast-limit-queue",
    "deadline-pause",
    "swipe-cancel-dismiss",
    "duplicate-policy",
    "ordered-callbacks",
    "announcement-dedupe",
    "announcement-rate-limit",
    "route-destroy-cleanup",
  ],
  locales: ["ar-EG-rtl", "hi-IN", "ja-JP", "de-DE", "fr-FR"],
  browsers: [
    "chromium",
    "firefox",
    "webkit",
    "mobile-chromium",
    "mobile-webkit",
  ],
  negativeCodes: [
    "UIFN_GESTURE_AFTER_CANCEL",
    "UIFN_RANGE_DIRECTION_INVALID",
    "UIFN_AMBIENT_DATE_PARSE",
    "UIFN_DATE_VALUE_INVALID",
    "UIFN_COLOR_VALUE_INVALID",
    "UIFN_TIMER_DRIFT_BUDGET",
    "UIFN_ANNOUNCEMENT_FLOOD",
    "UIFN_TIMER_AFTER_DESTROY",
    "UIFN_UNLOCALIZED_DEFAULT",
    "UIFN_RTL_KEYBOARD_DIVERGED",
  ],
};
const operations = {
  AngleSlider: ["KEY_STEP", "POINTER_START", "LOST_POINTER_CAPTURE"],
  Carousel: ["DRAG_START", "DRAG_END", "PAUSE", "RESUME"],
  ColorPicker: ["SET_CHANNEL", "SET_AREA", "SET_VALUE"],
  DateInput: ["FOCUS_SEGMENT", "EDIT_SEGMENT", "COMMIT"],
  DatePicker: ["NAVIGATE_MONTH", "NAVIGATE_GRID", "SELECT_DATE"],
  Meter: ["GET_STATE", "GET_PARTS"],
  Progress: ["GET_STATE", "GET_PARTS"],
  RatingGroup: ["HOVER", "SELECT", "KEY_STEP"],
  SignaturePad: ["POINTER_START", "POINTER_CANCEL", "POINTER_END"],
  Slider: [
    "KEY_STEP",
    "POINTER_START",
    "POINTER_CANCEL",
    "LOST_POINTER_CAPTURE",
  ],
  Splitter: ["RESIZE_START", "RESIZE_MOVE", "RESIZE_CANCEL", "KEY_RESIZE"],
  Steps: ["GO_TO", "COMPLETE"],
  Timer: ["START", "VISIBILITY_CHANGE", "TICK", "COMPLETE"],
  Toast: [
    "ADD",
    "PAUSE",
    "RESUME",
    "SWIPE_CANCEL",
    "DISMISS",
    "ROUTE_CHANGE",
    "DESTROY",
  ],
};
const goldenCorpus = primitives.map((primitive) => ({
  primitive: primitive.name,
  kind: primitive.kind,
  anatomy: primitive.parts,
  operations: operations[primitive.name],
  traceChannels:
    primitive.kind === "interactive-controller"
      ? ["state", "parts", "callbacks", "dom"]
      : ["state", "parts"],
  requiredLocales: contracts.locales,
  deterministic: true,
}));
const header = {
  schemaVersion: 1,
  generatedBy: "generate-uifn-phase-10.mjs",
  phase: "PHASE_10",
  implementationEvidence: true,
};
const outputs = {
  "phase-10-exports.json": `${JSON.stringify({ ...header, primitives }, null, 2)}\n`,
  "phase-10-behavior-contracts.json": `${JSON.stringify({ ...header, contracts }, null, 2)}\n`,
  "phase-10-golden-corpus.json": `${JSON.stringify({ ...header, primitiveCount: primitives.length, catalogPrimitiveCount, corpus: goldenCorpus }, null, 2)}\n`,
  "phase-10-test-manifest.json": `${JSON.stringify(
    {
      ...header,
      requirements: ["PRIM-006", "PRIM-007", "PRIM-008", "I18N-001"],
      vectors: [
        "TV-PRIM-006-P",
        "TV-PRIM-006-N",
        "TV-PRIM-007-P",
        "TV-PRIM-007-N",
        "TV-PRIM-008-P",
        "TV-PRIM-008-N",
        "TV-I18N-001-P",
        "TV-I18N-001-N",
      ],
      fixtures: [
        "lost-pointer-capture",
        "pointer-cancel",
        "zoom",
        "rtl-axis",
        "mobile-touch",
        "dst-gap",
        "dst-fold",
        "locale-calendar",
        "color-alpha-round-trip",
        "timer-drift",
        "toast-queue-pause-destroy",
        "announcement-flood",
      ],
      browsers: contracts.browsers,
      suites: [
        "uifn/core/src/__tests__/phase-10-gesture-date-feedback.test.ts",
        "uifn/dom/browser/phase10-primitives.spec.ts",
        "scripts/verify-uifn-phase-10-contract.test.mjs",
      ],
    },
    null,
    2,
  )}\n`,
};

try {
  if (mode === "write") {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all(
      Object.entries(outputs).map(([name, contents]) =>
        writeFile(path.join(outputRoot, name), contents, "utf8"),
      ),
    );
  } else {
    for (const [name, expected] of Object.entries(outputs)) {
      const actual = await readFile(path.join(outputRoot, name), "utf8");
      const equal = name.endsWith(".json")
        ? JSON.stringify(JSON.parse(actual)) ===
          JSON.stringify(JSON.parse(expected))
        : actual === expected;
      if (!equal) throw new Error(`UIFN_PHASE_10_GENERATED_DRIFT: ${name}`);
    }
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: `generate:uifn-phase-10:${mode}`,
        outputCount: Object.keys(outputs).length,
        primitiveCount: primitives.length,
        catalogPrimitiveCount,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        command: `generate:uifn-phase-10:${mode}`,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
