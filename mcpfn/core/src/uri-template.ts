export function uriTemplateMatchShape(uriTemplate: string): string {
  return uriTemplate.replace(/\{([^{}]+)\}/g, (_match, expression: string) => {
    const operator = /^[+#./?&]/.exec(expression)?.[0] ?? "";
    if (operator === "?" || operator === "&") {
      const names = expression.slice(1)
        .split(",")
        .map((name) => name.replace(/\*/g, "").trim())
        .join(",");
      return `{query:${operator}:${names}}`;
    }
    const exploded = expression.includes("*");
    if (operator === "+" || operator === "#") return "{reserved}";
    if (operator === ".") return ".{simple}";
    if (operator === "/") return exploded ? "/{simple-exploded}" : "/{simple}";
    return exploded ? "{simple-exploded}" : "{simple}";
  });
}
