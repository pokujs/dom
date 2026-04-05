import { readFile, writeFile } from 'node:fs/promises';

const distIndexUrl = new URL('../dist/index.js', import.meta.url);
const builtinSpecifiers = ['fs', 'path', 'url', 'module'];

let output = await readFile(distIndexUrl, 'utf8');

for (const specifier of builtinSpecifiers) {
  output = output.replaceAll(`from "${specifier}"`, `from "node:${specifier}"`);
}

await writeFile(distIndexUrl, output);