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

/** A `function name(...) { ... }` declaration, sliced by brace matching. */
export function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`client.js no longer declares function ${name}()`);

  let index = source.indexOf('{', source.indexOf('(', start));
  if (index < 0) throw new Error(`no body for ${name}()`);
  let depth = 0;
  for (; index < source.length; index += 1) {
    const char = source[index];
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
  const names = functions.join(', ');
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\n\nreturn { ${names} };`)();
}
