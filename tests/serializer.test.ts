import { AssertionError, strict as nodeAssert } from 'node:assert';
import { GlobalWindow } from 'happy-dom';
import { JSDOM } from 'jsdom';
import { describe, it, assert } from 'poku';
import { captureAssertions, registerSerializer } from 'poku/plugins';
import { formatDomNode, registerDomSerializer } from '../src/serializer.ts';
import {
  setupHappyDomEnvironment,
  setupJsdomEnvironment,
  disposeDomSerializer,
} from '../src/dom-env.ts';

process.exitCode ??= 0;

const runtimeOptions = {
  domUrl: 'http://localhost/',
  metricsEnabled: false,
  minMetricMs: 0,
  metricBatchSize: 5,
  metricFlushMs: 10,
};

const failureOutput = async (actual: unknown): Promise<string> => {
  const error = new AssertionError({
    actual,
    expected: null,
    operator: 'strictEqual',
    message: 'DOM serializer integration failure',
  });
  const result = await captureAssertions(() =>
    assert.strictEqual(actual, null, error)
  );
  const previous = process.exitCode;
  const write = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk: any): boolean => {
    output += String(chunk);
    return true;
  };
  try {
    result.report();
  } finally {
    process.stdout.write = write;
    process.exitCode = previous ?? 0;
  }
  return output;
};

await describe('DOM assertion serialization', async () => {
  for (const setup of [setupHappyDomEnvironment, setupJsdomEnvironment]) {
    await it(`${setup.name} installs a serializer for real nodes and disposes it`, async () => {
      await setup({ runtimeOptions, packageTag: '@pokujs/dom' });
      const node = document.createElement('section');
      node.innerHTML = '<span data-label="hello">world</span>';
      nodeAssert.match(
        await failureOutput(node),
        /\[DOMNode <section><span data-label="hello">world<\/span><\/section>\]/
      );
      nodeAssert.doesNotMatch(
        await failureOutput({ nodeType: 1, nodeName: 'SECTION', content: 42 }),
        /\[DOMNode/
      );
      let probes = 0;
      const ordinary = Object.defineProperties(
        { content: 42 },
        {
          nodeType: {
            get() {
              probes++;
              throw new Error('nodeType probed');
            },
          },
          nodeName: {
            get() {
              probes++;
              throw new Error('nodeName probed');
            },
          },
        }
      );
      nodeAssert.doesNotMatch(await failureOutput(ordinary), /\[DOMNode/);
      nodeAssert.strictEqual(probes, 0);
      const disposeFallback = registerSerializer({
        name: 'test.dom-fallback',
        test: (value) => value === node,
        serialize: () => '[fallback node]',
      });
      try {
        nodeAssert.match(await failureOutput(node), /\[DOMNode/);
        disposeDomSerializer();
        nodeAssert.match(await failureOutput(node), /\[fallback node\]/);
      } finally {
        disposeFallback();
      }
      await setup({ runtimeOptions, packageTag: '@pokujs/dom' });
      nodeAssert.match(await failureOutput(node), /\[DOMNode/);
      disposeDomSerializer();
    });
  }

  await it('replaces adapters without allowing an old disposer to remove the new serializer', async () => {
    const happy = new GlobalWindow();
    const jsdom = new JSDOM('');
    const disposeHappy = registerDomSerializer(
      happy.Node as unknown as typeof Node
    );
    const disposeJsdom = registerDomSerializer(jsdom.window.Node);
    const previousNode = happy.document.createElement('b');
    const disposeFallback = registerSerializer({
      name: 'test.previous-adapter',
      test: (value) => value === previousNode,
      serialize: () => '[previous adapter]',
    });
    try {
      disposeHappy();
      nodeAssert.match(
        await failureOutput(jsdom.window.document.createElement('b')),
        /\[DOMNode <b><\/b>\]/
      );
      nodeAssert.match(
        await failureOutput(previousNode),
        /\[previous adapter\]/
      );
    } finally {
      disposeJsdom();
      disposeFallback();
      jsdom.window.close();
      await happy.happyDOM.close();
    }
  });

  await it('bounds text, attributes, node traversal and depth for every adapter', async () => {
    for (const setup of [setupHappyDomEnvironment, setupJsdomEnvironment]) {
      await setup({ runtimeOptions, packageTag: '@pokujs/dom' });
      const large = document.createElement('div');
      large.textContent = 'x'.repeat(100000);
      nodeAssert.ok(formatDomNode(large).length <= 2011);
      nodeAssert.match(formatDomNode(large), /…\]$/);
      const report = await failureOutput(large);
      nodeAssert.match(report, /\[DOMNode .*…\]/);
      nodeAssert.ok(report.length < 10000);
      large.textContent = '';
      large.setAttribute('data-long', '"'.repeat(10000));
      nodeAssert.ok(formatDomNode(large).length <= 2011);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 500; i++)
        fragment.appendChild(document.createElement('i'));
      nodeAssert.match(formatDomNode(fragment), /…\]$/);
      let nested: Element = large;
      large.removeAttribute('data-long');
      for (let i = 0; i < 50; i++) {
        const next = document.createElement('b');
        nested.appendChild(next);
        nested = next;
      }
      nodeAssert.match(formatDomNode(large), /…\]$/);
      nodeAssert.strictEqual(
        formatDomNode(document.createTextNode('<hello>')),
        '[DOMNode &lt;hello>]'
      );
      nodeAssert.strictEqual(
        formatDomNode(document.createComment('hello')),
        '[DOMNode <!--hello-->]'
      );
      disposeDomSerializer();
    }
  });
});
