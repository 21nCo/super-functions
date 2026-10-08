// NODE_OPTIONS uses spaces and double quotes; backslashes escape characters
// inside quotes. Match Node's tokenizer, not shell quoting rules.
function nodeOptionsArguments(source: string): string[] {
  const args: string[] = [];
  let quoted = false, newArgument = true;
  for (let index = 0; index < source.length; index++) {
    let character = source[index];
    if (character === "\\" && quoted) character = source[++index];
    else if (character === " " && !quoted) { newArgument = true; continue; }
    else if (character === '"') { quoted = !quoted; continue; }
    if (newArgument) { args.push(character); newArgument = false; }
    else args[args.length - 1] += character;
  }
  return args;
}

const startupArguments = [
  ...nodeOptionsArguments(process.env.NODE_OPTIONS ?? ""), ...process.execArgv,
];
const customConditions: string[] = [];
let addons = true;
for (let index = 0; index < startupArguments.length; index++) {
  const argument = startupArguments[index];
  if (argument === "--conditions" || argument === "-C") {
    customConditions.push(startupArguments[++index]);
  } else if (argument.startsWith("--conditions=")) {
    customConditions.push(argument.slice("--conditions=".length));
  } else if (argument.replaceAll("_", "-") === "--no-addons") addons = false;
  else if (argument === "--addons") addons = true;
}
const baseConditions = [
  "node", ...(addons ? ["node-addons"] : []),
  ...(Reflect.get(process.features, "require_module") === true ? ["module-sync"] : []),
  ...customConditions,
];

interface BabelProgram {
  node: { body: unknown[] };
  scope: { hasBinding(name: string): boolean };
}

/** Supply startup conditions to Jiti's resolver for every transformed module.
 * Jiti owns parsing, resolution and evaluation; no dependency graph is staged.
 */
export function configConditionsPlugin({ template }: { template: { ast(source: string): unknown } }) {
  return {
    post(file: { path: BabelProgram }) {
      const imports = JSON.stringify([...baseConditions, "import"]);
      const requires = JSON.stringify([...baseConditions, "require"]);
      let source = `
        jitiImport = ((load) => (id, options) => load(id, {...options, conditions: ${imports}}))(jitiImport);
        jitiESMResolve = ((resolve) => (id, options) => resolve(id, {
          ...(typeof options === "string" ? {parentURL: options} : options), conditions: ${imports}
        }))(jitiESMResolve);
      `;
      // A user-created require already inherits native startup conditions.
      if (!file.path.scope.hasBinding("require")) {
        source += `require = ((original) => Object.assign(
          (id) => original(original.resolve(id, {conditions: ${requires}})), original,
          {resolve: Object.assign((id, options) => original.resolve(id, {...options, conditions: ${requires}}), original.resolve)}
        ))(require);`;
        if (!file.path.scope.hasBinding("module")) source += "module.require = require;";
      }
      // Module-transform plugins hoist imports during Program.exit. Post runs
      // after those visitors so conditions apply even to the first static import.
      const statements = template.ast(source);
      file.path.node.body.unshift(...(Array.isArray(statements) ? statements : [statements]));
    },
  };
}
