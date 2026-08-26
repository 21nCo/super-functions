// Generated from uifn/catalog/generated/catalog.json. Do not edit by hand.
export const CATALOG_ACCESSIBILITY = {
  "accordion": {
    "profile": "disclosure",
    "primitiveNotes": [
      "Apply the disclosure profile specifically to Accordion; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "trigger-text",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "expanded-state-via-native-or-aria-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "visible-trigger-focus",
        "no-focus-loss-on-collapse"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowDown",
          "ArrowUp",
          "Home",
          "End"
        ],
        "model": "disclosure"
      },
      "nativeSemantics": "Use a native button for each trigger and a related region only when the content warrants a landmark.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-disclosure"
      ],
      "pointerTouch": [
        "activate-trigger",
        "preserve-native-click-semantics"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "alert-dialog": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Outside interaction does not dismiss by default.",
      "A title and least-destructive initial focus strategy are required."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "angle-slider": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to AngleSlider; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "autocomplete": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to Autocomplete; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "avatar": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to Avatar; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "button": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to Button; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "carousel": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to Carousel; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "checkbox": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to Checkbox; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "checkbox-group": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to CheckboxGroup; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "clipboard": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Clipboard content is never serialized into traces or announcements."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "collapsible": {
    "profile": "disclosure",
    "primitiveNotes": [
      "Apply the disclosure profile specifically to Collapsible; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "trigger-text",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "expanded-state-via-native-or-aria-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "visible-trigger-focus",
        "no-focus-loss-on-collapse"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowDown",
          "ArrowUp",
          "Home",
          "End"
        ],
        "model": "disclosure"
      },
      "nativeSemantics": "Use a native button for each trigger and a related region only when the content warrants a landmark.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-disclosure"
      ],
      "pointerTouch": [
        "activate-trigger",
        "preserve-native-click-semantics"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "color-picker": {
    "profile": "date-color",
    "primitiveNotes": [
      "Apply the date-color profile specifically to ColorPicker; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value",
        "selection-status",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "segment-focus",
        "grid-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Escape"
        ],
        "model": "segment-grid-channel-specific"
      },
      "nativeSemantics": "Expose structured locale-aware segments, grids, or channels rather than display-string identity.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-grid",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "segment-or-grid-selection",
        "drag-channel-with-keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "combobox": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to Combobox; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "context-menu": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to ContextMenu; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "date-input": {
    "profile": "date-color",
    "primitiveNotes": [
      "Apply the date-color profile specifically to DateInput; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value",
        "selection-status",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "segment-focus",
        "grid-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Escape"
        ],
        "model": "segment-grid-channel-specific"
      },
      "nativeSemantics": "Expose structured locale-aware segments, grids, or channels rather than display-string identity.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-grid",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "segment-or-grid-selection",
        "drag-channel-with-keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "date-picker": {
    "profile": "date-color",
    "primitiveNotes": [
      "Apply the date-color profile specifically to DatePicker; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value",
        "selection-status",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "segment-focus",
        "grid-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Escape"
        ],
        "model": "segment-grid-channel-specific"
      },
      "nativeSemantics": "Expose structured locale-aware segments, grids, or channels rather than display-string identity.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-grid",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "segment-or-grid-selection",
        "drag-channel-with-keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "dialog": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Apply the modal-overlay profile specifically to Dialog; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "drawer": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Apply the modal-overlay profile specifically to Drawer; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "editable": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Editable; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "field": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Field; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "fieldset": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Fieldset; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "file-upload": {
    "profile": "forms-input",
    "primitiveNotes": [
      "File names may be announced to the user but file contents never enter traces or serialization."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "floating-panel": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Apply the modal-overlay profile specifically to FloatingPanel; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "form": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Form; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "hover-card": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Apply the modal-overlay profile specifically to HoverCard; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "image-cropper": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to ImageCropper; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "input": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Input; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "listbox": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to Listbox; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "marquee": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to Marquee; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "menu": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to Menu; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "menubar": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to Menubar; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "meter": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Apply the status-feedback profile specifically to Meter; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "navigation-menu": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to NavigationMenu; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "number-input": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to NumberInput; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "pagination": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to Pagination; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "password-input": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Password content is always redacted from traces, warnings, and announcements."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "pin-input": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to PinInput; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "popover": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Apply the modal-overlay profile specifically to Popover; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "progress": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Apply the status-feedback profile specifically to Progress; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "qr-code": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to QRCode; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "radio-group": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to RadioGroup; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "rating-group": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to RatingGroup; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "scroll-area": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to ScrollArea; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "segment-group": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to SegmentGroup; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "select": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to Select; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "separator": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to Separator; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "signature-pad": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to SignaturePad; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "slider": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to Slider; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "splitter": {
    "profile": "range-gesture",
    "primitiveNotes": [
      "Apply the range-gesture profile specifically to Splitter; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "localized-value-text",
        "rate-limited-continuous-change"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "focusable-operable-handle",
        "multi-handle-order",
        "visible-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown"
        ],
        "model": "range-or-gesture-specific"
      },
      "nativeSemantics": "Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-slider",
        "wai-aria-apg-carousel"
      ],
      "pointerTouch": [
        "pointer-capture",
        "cancel-and-lost-capture",
        "touch-scroll-arbitration",
        "keyboard-alternative"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.7",
        "2.5.1",
        "2.5.7",
        "2.5.8",
        "4.1.2"
      ]
    }
  },
  "steps": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Apply the status-feedback profile specifically to Steps; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "switch": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Switch; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "tabs": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to Tabs; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "tags-input": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to TagsInput; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "timer": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Apply the status-feedback profile specifically to Timer; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "toast": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Apply the status-feedback profile specifically to Toast; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "toggle": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to Toggle; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "toggle-group": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to ToggleGroup; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "toolbar": {
    "profile": "menu-navigation",
    "primitiveNotes": [
      "Apply the menu-navigation profile specifically to Toolbar; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "active-selected-expanded-current-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "roving-tabindex-or-activedescendant",
        "deterministic-focus-repair",
        "restore-focus"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "primitive-specific-navigation"
      },
      "nativeSemantics": "Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-menu",
        "wai-aria-apg-tabs",
        "wai-aria-apg-treeview"
      ],
      "pointerTouch": [
        "item-activation",
        "submenu-pointer-grace-where-applicable",
        "contextmenu-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "2.5.7",
        "4.1.2"
      ]
    }
  },
  "tooltip": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Content supplies a description relationship and never replaces the trigger accessible name by accident."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "tour": {
    "profile": "modal-overlay",
    "primitiveNotes": [
      "Apply the modal-overlay profile specifically to Tour; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "title-part",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "role-name-description-state-on-open"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "initial-focus",
        "containment-when-modal",
        "restore-focus",
        "nested-scope-arbitration"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Escape",
          "Enter",
          "Space"
        ],
        "model": "overlay-specific"
      },
      "nativeSemantics": "Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-dialog-modal",
        "wai-aria-apg-tooltip"
      ],
      "pointerTouch": [
        "trigger-activation",
        "outside-interaction-by-declared-policy",
        "touch-cancellation"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.4.13",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "2.4.11",
        "4.1.2"
      ]
    }
  },
  "tree-view": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "Apply the selection-collection profile specifically to TreeView; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "badge": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to Badge; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "breadcrumb": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "The root is a labelled navigation landmark and the current page uses aria-current=\"page\".",
      "Separators are decorative and hidden from assistive technology."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "card": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "Apply the static-foundation profile specifically to Card; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "command": {
    "profile": "selection-collection",
    "primitiveNotes": [
      "The input owns combobox semantics and points to the command list with aria-controls.",
      "Keyboard navigation skips disabled items and preserves composition input."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "selection-change",
        "result-count-when-dynamic",
        "validation-state"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "active-item",
        "selected-item",
        "dynamic-collection-focus-repair"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
          "Enter",
          "Space",
          "Escape",
          "typeahead"
        ],
        "model": "selection-specific"
      },
      "nativeSemantics": "Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-listbox",
        "wai-aria-apg-combobox",
        "wai-aria-apg-radio"
      ],
      "pointerTouch": [
        "select-item",
        "toggle-item",
        "touch-scroll-arbitration"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.1.2",
        "2.4.3",
        "2.4.7",
        "3.3.1",
        "3.3.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "input-group": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to InputGroup; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "skeleton": {
    "profile": "status-feedback",
    "primitiveNotes": [
      "Skeleton geometry is decorative and hidden from the accessibility tree.",
      "The owning content region is responsible for announcing busy state when appropriate."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "visible-label",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "politeness-by-severity",
        "deduplicate",
        "rate-limit",
        "ordered-queue"
      ],
      "description": {
        "relationships": [
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "do-not-steal-focus-for-passive-status",
        "restore-focus-for-dismissed-workflow"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "Escape"
        ],
        "model": "native-or-workflow-specific"
      },
      "nativeSemantics": "Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.",
      "normativeBasis": [
        "native-html",
        "wai-aria-live-regions"
      ],
      "pointerTouch": [
        "action-activation-where-interactive",
        "swipe-with-keyboard-alternative-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "2.1.1",
        "2.2.1",
        "2.4.3",
        "3.2.2",
        "4.1.2",
        "4.1.3"
      ]
    }
  },
  "table": {
    "profile": "static-foundation",
    "primitiveNotes": [
      "The semantic table, sections, rows, header cells, data cells, and caption are preserved.",
      "Consumers must provide meaningful column headers and a caption or external accessible name."
    ],
    "rules": {
      "accessibleName": {
        "required": false,
        "sources": [
          "native-text",
          "alt",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "none-unless-status-semantics-declared"
      ],
      "description": {
        "relationships": [
          "native-description",
          "aria-describedby"
        ],
        "supported": true
      },
      "focus": [
        "native-focus-only",
        "visible-focus-where-focusable"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space"
        ],
        "model": "native-only"
      },
      "nativeSemantics": "Use the strongest native element and avoid adding widget roles or subscriptions to static content.",
      "normativeBasis": [
        "native-html"
      ],
      "pointerTouch": [
        "native-activation-where-interactive"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.1.1",
        "1.3.1",
        "1.4.1",
        "2.1.1",
        "2.4.7",
        "4.1.2"
      ]
    }
  },
  "textarea": {
    "profile": "forms-input",
    "primitiveNotes": [
      "Apply the forms-input profile specifically to Textarea; implementation vectors own exact behavior."
    ],
    "rules": {
      "accessibleName": {
        "required": true,
        "sources": [
          "label-element",
          "aria-label",
          "aria-labelledby"
        ]
      },
      "announcements": [
        "validation-error",
        "status-change",
        "operation-result-without-secret-content"
      ],
      "description": {
        "relationships": [
          "aria-describedby",
          "aria-errormessage"
        ],
        "supported": true
      },
      "focus": [
        "visible-input-focus",
        "error-focus-policy",
        "caret-and-selection-preservation"
      ],
      "keyboard": {
        "keys": [
          "Tab",
          "Shift+Tab",
          "Enter",
          "Space",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "composition"
        ],
        "model": "native-input-plus-declared-enhancements"
      },
      "nativeSemantics": "Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.",
      "normativeBasis": [
        "native-html",
        "wai-aria-apg-spinbutton"
      ],
      "pointerTouch": [
        "native-control-interaction",
        "target-size",
        "file-picker-where-applicable"
      ],
      "preferences": {
        "forcedColors": "Use native/system colors and preserve perceivable state without color alone.",
        "reducedMotion": "Remove non-essential motion while preserving state changes and completion.",
        "reflow": "Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.",
        "rtl": "Declare logical versus physical direction behavior and mirror only directional semantics."
      },
      "wcag": [
        "1.3.1",
        "1.3.5",
        "2.1.1",
        "2.4.3",
        "2.4.7",
        "2.5.8",
        "3.3.1",
        "3.3.2",
        "3.3.3",
        "4.1.2",
        "4.1.3"
      ]
    }
  }
} as const;
