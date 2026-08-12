/**
 * Parse library initialization files and extract configs
 * 
 * This parses TypeScript/JavaScript files to find library initialization calls
 * (e.g., createConductBackend, createAuthFn) and extracts the config objects
 * passed to them.
 */

import * as ts from 'typescript';
import fs from 'node:fs';
import type { PackageRegistry } from './discover-packages.js';

export interface ParsedLibraryInit {
  libraryName: string;
  packageName: string;
  functionName: string;
  config: any;
  location: { line: number; column: number };
}

/**
 * Parse a file and extract library initialization calls
 */
export function parseLibraryInitializations(
  filePath: string,
  registry: PackageRegistry
): ParsedLibraryInit[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  const results: ParsedLibraryInit[] = [];
  
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const functionName = node.expression.getText(sourceFile);
      
      if (functionName in registry) {
        const configArg = node.arguments[0];
        if (configArg) {
          try {
            // Extract config object
            const config = extractConfigObject(configArg, sourceFile);
            
            const registryEntry = registry[functionName];
            const packageName =
              typeof registryEntry === 'string' ? registryEntry : registryEntry.packageName;
            const libraryName =
              typeof registryEntry === 'string'
                ? packageName.split('/').pop()!.replace('@superfunctions/', '')
                : registryEntry.libraryName;
            
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            
            results.push({
              libraryName,
              packageName,
              functionName,
              config,
              location: { line: line + 1, column: character + 1 },
            });
          } catch (e: any) {
            console.warn(`⚠️  Could not extract config from ${functionName} call: ${e.message}`);
          }
        }
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return results;
}

function extractConfigObject(node: ts.Node, sourceFile: ts.SourceFile): any {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    return extractConfigObject(node.expression, sourceFile);
  }

  // Handle direct object literals
  if (ts.isObjectLiteralExpression(node)) {
    return parseObjectLiteral(node, sourceFile);
  }
  
  // Handle variable references
  if (ts.isIdentifier(node)) {
    // Try to resolve the variable
    const varName = node.text;
    const resolved = resolveVariable(varName, sourceFile);
    if (resolved) {
      return extractConfigObject(resolved, sourceFile);
    }
    throw new Error(`Cannot resolve variable: ${varName}`);
  }
  
  // Handle spread operators
  if (ts.isSpreadElement(node)) {
    return extractConfigObject(node.expression, sourceFile);
  }
  
  throw new Error('Config must be an object literal or resolvable variable');
}

function parseObjectLiteral(node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile): any {
  const obj: any = {};
  
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = getPropertyName(prop.name);
      if (key) {
        obj[key] = evaluateExpression(prop.initializer, sourceFile);
      }
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text;
      // For shorthand properties, we can't easily resolve the value
      // Mark as undefined to indicate it needs runtime resolution
      obj[key] = undefined;
    } else if (ts.isSpreadAssignment(prop)) {
      // Handle spread in object literal
      const spreadValue = evaluateExpression(prop.expression, sourceFile);
      if (typeof spreadValue === 'object' && spreadValue !== null) {
        Object.assign(obj, spreadValue);
      }
    }
  }
  
  return obj;
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  if (ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function evaluateExpression(node: ts.Node, sourceFile: ts.SourceFile): any {
  // Primitives
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
    return undefined;
  }
  
  // Object literals
  if (ts.isObjectLiteralExpression(node)) {
    return parseObjectLiteral(node, sourceFile);
  }
  
  // Arrays
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(el => evaluateExpression(el, sourceFile));
  }
  
  // Identifiers (variable references)
  if (ts.isIdentifier(node)) {
    const varName = node.text;
    const resolved = resolveVariable(varName, sourceFile);
    if (resolved) {
      return evaluateExpression(resolved, sourceFile);
    }
    // Cannot resolve - return placeholder
    return undefined;
  }
  
  // Property access (e.g., process.env.DATABASE_URL)
  if (ts.isPropertyAccessExpression(node)) {
    // For now, mark as undefined - runtime values
    return undefined;
  }
  
  // Template literals
  if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    // Cannot evaluate template literals statically
    return undefined;
  }
  
  // Function calls (e.g., plugin() calls)
  if (ts.isCallExpression(node)) {
    // Return placeholder object indicating it's a function call
    const fnName = node.expression.getText(sourceFile);
    return {
      __functionCall: fnName,
      __args: node.arguments.map((arg) => evaluateExpression(arg, sourceFile))
    };
  }
  
  // Arrow functions
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return { __function: true };
  }
  
  // For everything else, return undefined
  return undefined;
}

function resolveVariable(varName: string, sourceFile: ts.SourceFile): ts.Node | null {
  let result: ts.Node | null = null;
  
  function visit(node: ts.Node) {
    // Look for variable declarations
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.name.text === varName && node.initializer) {
        result = node.initializer;
      }
    }
    
    // Look for const declarations
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === varName && decl.initializer) {
          result = decl.initializer;
        }
      }
    }
    
    if (!result) {
      ts.forEachChild(node, visit);
    }
  }
  
  visit(sourceFile);
  return result;
}
