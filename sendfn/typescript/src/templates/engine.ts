import { EmailTemplate } from '../types';
import { TemplateError } from '../errors';

type TemplateNode =
  | { type: 'text'; value: string }
  | { type: 'variable'; name: string }
  | { type: 'if'; name: string; children: TemplateNode[] }
  | { type: 'each'; name: string; children: TemplateNode[] };

type ParseFrame = { type: 'root' | 'if' | 'each'; name?: string; children: TemplateNode[] };

export class TemplateEngine {
  render(template: string, data: Record<string, any>): string {
    try {
      const nodes = this.parse(template);
      return this.renderNodes(nodes, [data]);
    } catch (error) {
      if (error instanceof TemplateError) {
        throw error;
      }

      throw new TemplateError('Malformed template block syntax', {
        code: 'SENDFN_TEMPLATE_RENDER_ERROR',
        details: {
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  validate(template: EmailTemplate, data: Record<string, any>): void {
    const missing: string[] = [];
    const optionalVariables = new Set<string>(
      Array.isArray(template.metadata?.optionalVariables)
        ? (template.metadata?.optionalVariables as string[])
        : []
    );

    for (const variable of template.variables) {
      if (data[variable] === undefined && !optionalVariables.has(variable)) {
        missing.push(variable);
      }
    }

    if (missing.length > 0) {
      throw new TemplateError(`Missing required variables: ${missing.join(', ')}`, {
        code: 'SENDFN_TEMPLATE_RENDER_ERROR',
        details: { missingVariables: missing },
      });
    }
  }

  extractVariables(template: string): string[] {
    const nodes = this.parse(template);
    const vars = new Set<string>();
    const visit = (children: TemplateNode[]) => {
      for (const node of children) {
        if (node.type === 'variable') {
          vars.add(node.name);
        } else if (node.type === 'if' || node.type === 'each') {
          vars.add(node.name);
          visit(node.children);
        }
      }
    };

    visit(nodes);
    return Array.from(vars);
  }

  private parse(template: string): TemplateNode[] {
    const tagRegex = /\{\{([^}]+)\}\}/g;
    const frames: ParseFrame[] = [{ type: 'root', children: [] }];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(template)) !== null) {
      const [raw, inner] = match;
      const current = frames[frames.length - 1];

      if (match.index > cursor) {
        current.children.push({
          type: 'text',
          value: template.slice(cursor, match.index),
        });
      }

      const tag = inner.trim();
      if (tag.startsWith('#')) {
        const [, helper, name] = /^#(if|each)\s+([a-zA-Z0-9_.]+)$/.exec(tag) || [];
        if (!helper || !name) {
          throw new Error(`Unsupported block tag: ${tag}`);
        }

        const frame: ParseFrame = {
          type: helper as 'if' | 'each',
          name,
          children: [],
        };
        current.children.push(frame as TemplateNode);
        frames.push(frame);
      } else if (tag.startsWith('/')) {
        const [, helper] = /^\/(if|each)$/.exec(tag) || [];
        if (!helper || frames.length === 1) {
          throw new Error(`Unexpected closing tag: ${tag}`);
        }

        const frame = frames.pop();
        if (!frame || frame.type !== helper) {
          throw new Error(`Mismatched closing tag: ${tag}`);
        }
      } else {
        if (!/^[a-zA-Z0-9_.]+$/.test(tag)) {
          throw new Error(`Unsupported variable tag: ${tag}`);
        }
        current.children.push({ type: 'variable', name: tag });
      }

      cursor = match.index + raw.length;
    }

    if (cursor < template.length) {
      frames[frames.length - 1].children.push({
        type: 'text',
        value: template.slice(cursor),
      });
    }

    if (frames.length !== 1) {
      throw new Error('Unclosed template block');
    }

    return frames[0].children;
  }

  private renderNodes(nodes: TemplateNode[], scopes: Array<Record<string, any>>): string {
    return nodes
      .map((node) => {
        switch (node.type) {
          case 'text':
            return node.value;
          case 'variable': {
            const value = this.resolveValue(node.name, scopes);
            return value === undefined || value === null ? '' : this.escapeHtml(String(value));
          }
          case 'if':
            return this.resolveValue(node.name, scopes)
              ? this.renderNodes(node.children, scopes)
              : '';
          case 'each': {
            const value = this.resolveValue(node.name, scopes);
            if (!Array.isArray(value)) {
              return '';
            }
            return value
              .map((item) =>
                this.renderNodes(
                  node.children,
                  [
                    typeof item === 'object' && item !== null
                      ? ({ ...item, this: item } as Record<string, any>)
                      : ({ this: item } as Record<string, any>),
                    ...scopes,
                  ]
                )
              )
              .join('');
          }
        }
      })
      .join('');
  }

  private resolveValue(path: string, scopes: Array<Record<string, any>>): unknown {
    const parts = path.split('.');

    for (const scope of scopes) {
      let value: unknown = scope;
      let matched = true;

      for (const part of parts) {
        if (
          value !== null &&
          value !== undefined &&
          typeof value === 'object' &&
          part in (value as Record<string, unknown>)
        ) {
          value = (value as Record<string, unknown>)[part];
        } else {
          matched = false;
          break;
        }
      }

      if (matched) {
        return value;
      }
    }

    return undefined;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export class TemplateRegistry {
  private templates = new Map<string, EmailTemplate>();

  register(template: EmailTemplate): void {
    this.templates.set(template.id, template);
  }

  get(templateId: string): EmailTemplate | undefined {
    return this.templates.get(templateId);
  }

  list(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }
}
