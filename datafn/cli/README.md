# @datafn/cli

CLI tools and code generation for DataFn.

## Installation

```bash
npm install @datafn/cli
```

## Features

- **Code Generation**: Generate TypeScript interfaces and types from DataFn schemas.
- **Client Types**: Generates typed clients for usage with `@datafn/client`.

## API

### generateTypes(schema: unknown): string

Generates TypeScript definitions from a DataFn schema.

```typescript
import { generateTypes } from "@datafn/cli";

const schema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

const code = generateTypes(schema);
// Returns a string containing TypeScript interfaces and types
```

The generated code includes:
- Interfaces for each resource (e.g., `interface Task { ... }`)
- `Tables` mapping interface
- `TypedClient` type definition

## License

MIT
