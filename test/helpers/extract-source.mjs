/**
 * Loads the pure helpers straight out of `client.js`.
 *
 * The plugin ships as a browser module (`window.__ModuleLoader__.load({ factory })`),
 * so nothing inside it can be imported by Node. Rather than keeping a second copy of
 * the line logic in a test-only module (which drifts), these tests slice the exact
 * function bodies out of the shipped source and evaluate them. If a function is
 * renamed or removed, extraction throws and the suite fails loudly.
 */
import { readFileSync } from 'node:fs';

export const CLIENT_PATH = new URL('../../client.js', import.meta.url);

export function readClient() {
  return readFileSync(CLIENT_PATH, 'utf8');
}

/** `const NAME = ....;` on one line. */
export function extractConst(source, name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`client.js no longer declares ${name}`);
  const end = source.indexOf('\n', start);
  if (end < 0) throw new Error(`unterminated ${name} declaration`);
  return source.slice(start, end);
}

const QUOTES = new Set(['"', "'", '`']);

/**
 * A `function name(...) { ... }` declaration, sliced by brace matching.
 *
 * String and template literals, line comments and block comments are skipped, so a
 * `}` inside `'...'` or a `// }` no longer truncates the slice. Regex literals are
 * NOT understood — a `/}/` inside a function body would still confuse the scan; keep
 * such patterns in module-level consts (the plugin does).
 */
export function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`client.js no longer declares function ${name}()`);

  let index = source.indexOf('{', source.indexOf('(', start));
  if (index < 0) throw new Error(`no body for ${name}()`);

  let depth = 0;
  let quote = null;
  for (; index < source.length; index += 1) {
    const char = source[index];

    if (quote !== null) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (QUOTES.has(char)) {
      quote = char;
      continue;
    }

    if (char === '/' && source[index + 1] === '/') {
      const lineEnd = source.indexOf('\n', index);
      index = lineEnd < 0 ? source.length : lineEnd;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const blockEnd = source.indexOf('*/', index + 2);
      index = blockEnd < 0 ? source.length : blockEnd + 1;
      continue;
    }

    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`unbalanced braces in ${name}()`);
}

/**
 * Evaluates the named declarations and returns their bindings.
 * `consts` are `const NAME = ...` lines, `functions` are declarations.
 */
export function loadPure(consts, functions) {
  const source = readClient();
  const code = [
    ...consts.map((name) => extractConst(source, name)),
    ...functions.map((name) => extractFunction(source, name))
  ].join('\n\n');
  const names = functions.concat(consts.map((name) => name)).join(', ');
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\n\nreturn { ${names} };`)();
}
