export function unsupportedUriTemplateOperator(uriTemplate: string): string | undefined {
  for (const match of uriTemplate.matchAll(/\{([^{}]+)\}/g)) {
    if (match[1]?.startsWith(";")) return ";";
  }
  return undefined;
}

export function uriTemplateMatchShape(uriTemplate: string): string {
  return uriTemplate.replace(/\{([^{}]+)\}/g, (_match, expression: string) => {
    const operator = /^[+#./?&]/.exec(expression)?.[0] ?? "";
    if (operator === "?" || operator === "&") {
      const names = expression.slice(1)
        .split(",")
        // The pinned SDK expands and matches query variables identically with or
        // without `*`; keeping one shape prevents registration-order ambiguity.
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

type CharacterPredicate =
  | { kind: "literal"; value: string }
  | { kind: "except"; value: string };

interface TemplateTransition {
  predicate: CharacterPredicate;
  to: number;
}

interface TemplateState {
  epsilon: number[];
  transitions: TemplateTransition[];
}

interface TemplateAutomaton {
  final: number;
  states: TemplateState[];
}

function uriTemplateAutomaton(uriTemplate: string): TemplateAutomaton {
  const states: TemplateState[] = [{ epsilon: [], transitions: [] }];
  let state = 0;
  const nextState = () => {
    states.push({ epsilon: [], transitions: [] });
    return states.length - 1;
  };
  const literal = (value: string) => {
    for (const character of value) {
      const next = nextState();
      states[state]!.transitions.push({
        predicate: { kind: "literal", value: character },
        to: next,
      });
      state = next;
    }
  };
  const oneOrMore = (excluded: string) => {
    const loop = nextState();
    const next = nextState();
    const predicate = { kind: "except", value: excluded } as const;
    states[state]!.transitions.push({ predicate, to: loop });
    states[loop]!.transitions.push({ predicate, to: loop });
    states[loop]!.epsilon.push(next);
    state = next;
  };
  const expression = (value: string) => {
    const operator = /^[+#./?&]/.exec(value)?.[0] ?? "";
    const exploded = value.includes("*");
    const names = value.slice(operator.length).split(",")
      .map((name) => name.replace(/\*/g, "").trim())
      .filter(Boolean);
    if (operator === "?" || operator === "&") {
      names.forEach((name, index) => {
        literal(index === 0 ? operator : "&");
        literal(`${name}=`);
        oneOrMore("&");
      });
      return;
    }
    if (operator === ".") literal(".");
    if (operator === "/") literal("/");
    if (operator === "+" || operator === "#") oneOrMore("");
    else if (exploded) oneOrMore("/");
    else oneOrMore("/,");
  };
  const matcher = /\{([^{}]+)\}/g;
  let cursor = 0;
  for (const match of uriTemplate.matchAll(matcher)) {
    literal(uriTemplate.slice(cursor, match.index));
    expression(match[1]!);
    cursor = match.index! + match[0].length;
  }
  literal(uriTemplate.slice(cursor));
  return { final: state, states };
}

function epsilonClosure(automaton: TemplateAutomaton, initial: number): Set<number> {
  const closure = new Set([initial]);
  const queue = [initial];
  while (queue.length) {
    const state = queue.shift()!;
    for (const next of automaton.states[state]!.epsilon) {
      if (closure.has(next)) continue;
      closure.add(next);
      queue.push(next);
    }
  }
  return closure;
}

function predicatesOverlap(left: CharacterPredicate, right: CharacterPredicate): boolean {
  if (left.kind === "literal" && right.kind === "literal") return left.value === right.value;
  if (left.kind === "literal") return !right.value.includes(left.value);
  if (right.kind === "literal") return !left.value.includes(right.value);
  return true;
}

export function uriTemplatesOverlap(left: string, right: string): boolean {
  if (uriTemplateMatchShape(left) === uriTemplateMatchShape(right)) return true;
  const leftAutomaton = uriTemplateAutomaton(left);
  const rightAutomaton = uriTemplateAutomaton(right);
  const queue: Array<[number, number]> = [[0, 0]];
  const visited = new Set<string>();
  while (queue.length) {
    const [leftState, rightState] = queue.shift()!;
    const key = `${leftState}:${rightState}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const leftClosure = epsilonClosure(leftAutomaton, leftState);
    const rightClosure = epsilonClosure(rightAutomaton, rightState);
    if (leftClosure.has(leftAutomaton.final) && rightClosure.has(rightAutomaton.final)) {
      return true;
    }
    for (const leftCurrent of leftClosure) {
      for (const rightCurrent of rightClosure) {
        for (const leftTransition of leftAutomaton.states[leftCurrent]!.transitions) {
          for (const rightTransition of rightAutomaton.states[rightCurrent]!.transitions) {
            if (predicatesOverlap(leftTransition.predicate, rightTransition.predicate)) {
              queue.push([leftTransition.to, rightTransition.to]);
            }
          }
        }
      }
    }
  }
  return false;
}
