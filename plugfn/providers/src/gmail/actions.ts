import { z } from "zod";
import type { Action } from "plugfn";
import document from "../google/discovery/gmail.json" with { type: "json" };
import {
  googleDiscoveryProvider,
  type Discovery,
} from "../google/discovery-provider.js";

// Always operate on the authenticated mailbox. A tool argument cannot select another user.
const provider = googleDiscoveryProvider(
  "gmail",
  document as Discovery,
  {
    "messages.list": "users.messages.list",
    "messages.get": "users.messages.get",
    "threads.get": "users.threads.get",
    "attachments.get": "users.messages.attachments.get",
    "labels.list": "users.labels.list",
    "messages.modify": "users.messages.modify",
    "drafts.create": "users.drafts.create",
    "drafts.update": "users.drafts.update",
    "drafts.send": "users.drafts.send",
    "messages.send": "users.messages.send",
  },
  ["https://www.googleapis.com/auth/gmail.modify"],
);
export const gmailActions: Record<string, Action> = Object.fromEntries(
  Object.entries(provider.actions as Record<string, Action>).map(
    ([name, action]) => {
      const parameters = (action.parameters as z.AnyZodObject)
        .omit({ userId: true })
        .strict();
      const read = action.contract!.effect === "read";
      return [
        name,
        {
          ...action,
          parameters,
          contract: {
            ...action.contract!,
            requiredScopes: [
              read
                ? "https://www.googleapis.com/auth/gmail.readonly"
                : name === "messages.send"
                  ? "https://www.googleapis.com/auth/gmail.send"
                  : name.startsWith("drafts.")
                    ? "https://www.googleapis.com/auth/gmail.compose"
                    : "https://www.googleapis.com/auth/gmail.modify",
            ],
            resources: action.contract!.resources.filter(
              (r) => r.parameter !== "userId",
            ),
            sensitiveKeys: [
              ...action.contract!.sensitiveKeys,
              "raw",
              "snippet",
              "payload",
              "data",
            ],
          },
          execute: async (
            input: unknown,
            context: Parameters<Action["execute"]>[1],
          ) =>
            action.execute(
              { ...parameters.parse(input), userId: "me" },
              context,
            ),
        },
      ];
    },
  ),
);
