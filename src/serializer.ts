import { registerSerializer } from 'poku/plugins';

const MAX_LENGTH = 2000;
const MAX_NODES = 200;
const MAX_DEPTH = 10;

const escapeMarkup = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export const formatDomNode = (root: Node): string => {
  let output = '';
  let count = 0;
  let truncated = false;
  const append = (value: string) => {
    const remaining = MAX_LENGTH - output.length;
    if (value.length > remaining) truncated = true;
    output += value.slice(0, remaining);
  };
  const visit = (node: Node, depth: number): void => {
    if (
      output.length >= MAX_LENGTH ||
      count >= MAX_NODES ||
      depth > MAX_DEPTH
    ) {
      truncated = true;
      return;
    }
    count++;
    if (node.nodeType === 3) {
      append(escapeMarkup((node.nodeValue ?? '').slice(0, MAX_LENGTH)));
      if ((node.nodeValue?.length ?? 0) > MAX_LENGTH) truncated = true;
      return;
    }
    if (node.nodeType === 8) {
      append(`<!--${(node.nodeValue ?? '').slice(0, MAX_LENGTH)}-->`);
      return;
    }
    const element = node.nodeType === 1 ? (node as Element) : undefined;
    const tag = element?.tagName.toLowerCase();
    if (element) {
      append(`<${tag}`);
      for (let index = 0; index < element.attributes.length; index++) {
        if (output.length >= MAX_LENGTH) {
          truncated = true;
          break;
        }
        const attribute = element.attributes[index];
        if (!attribute) continue;
        append(
          ` ${attribute.name}="${escapeMarkup(attribute.value.slice(0, MAX_LENGTH))}"`
        );
      }
      append('>');
    }
    let child = node.firstChild;
    while (child) {
      visit(child, depth + 1);
      if (
        output.length >= MAX_LENGTH ||
        count >= MAX_NODES ||
        depth >= MAX_DEPTH
      ) {
        truncated = true;
        break;
      }
      child = child.nextSibling;
    }
    if (element) append(`</${tag}>`);
  };
  visit(root, 0);
  return `[DOMNode ${output}${truncated ? '…' : ''}]`;
};

export const registerDomSerializer = (
  NodeConstructor: typeof Node
): (() => void) =>
  registerSerializer({
    name: '@pokujs/dom.node',
    test: (value) => {
      try {
        return value instanceof NodeConstructor;
      } catch {
        return false;
      }
    },
    serialize: (value) => formatDomNode(value as Node),
  });

const SERIALIZER_DISPOSER_KEY = Symbol.for('@pokujs/dom.serializer-disposer');
const serializerGlobals = globalThis as typeof globalThis & {
  [SERIALIZER_DISPOSER_KEY]?: () => void;
};

export const disposeDomSerializer = (): void => {
  serializerGlobals[SERIALIZER_DISPOSER_KEY]?.();
  delete serializerGlobals[SERIALIZER_DISPOSER_KEY];
};

export const installDomSerializer = (NodeConstructor: typeof Node): void => {
  disposeDomSerializer();
  serializerGlobals[SERIALIZER_DISPOSER_KEY] =
    registerDomSerializer(NodeConstructor);
};
