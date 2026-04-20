import { afterEach, assert, beforeEach, describe, it } from "poku";
import { getScopeHooks } from "@pokujs/scope-hooks";
import {
	als,
	createLazyHolder,
	defineSlotKey,
	getCurrentScope,
	getOrCreateScope,
	type LazyHolder,
	type Observer,
	registerScopeHooks,
	runScoped,
	type TestScope,
} from "../src/test-scope.ts";

const SCOPE_HOOKS_KEY = Symbol.for('@pokujs/poku.test-scope-hooks');

// Helper: Get scope with assertion guard for use within runScoped() contexts
function ensureScope(): TestScope {
	const scope = getOrCreateScope();
	if (!scope) {
		assert.fail(
			"Scope must exist inside runScoped() context - this is a test bug",
		);
	}
	return scope;
}

describe("test-scope: TypeScript slot keys", async () => {
	await it("defineSlotKey creates branded symbol keys", async () => {
		const KEY_A = defineSlotKey<string>("@test/key-a");
		const KEY_B = defineSlotKey<number>("@test/key-b");
		const KEY_A_AGAIN = defineSlotKey<string>("@test/key-a");

		// Same name returns same symbol (Symbol.for)
		assert.strictEqual(KEY_A, KEY_A_AGAIN, "Same name gives same symbol");
		// Different names give different symbols
		assert.notStrictEqual(
			KEY_A,
			KEY_B,
			"Different names give different symbols",
		);
		// Symbols are symbols
		assert.strictEqual(typeof KEY_A, "symbol", "Key is a symbol");
	});
});

describe("test-scope: ALS laziness & holder creation", async () => {
	await it("createLazyHolder creates sentinel with undefined scope", async () => {
		const holder = createLazyHolder();
		assert.ok(holder, "Holder is defined");
		assert.strictEqual(holder.scope, undefined, "Initial scope is undefined");
	});

	await it("getOrCreateScope returns undefined outside ALS context", async () => {
		const scope = getOrCreateScope();
		assert.strictEqual(scope, undefined, "No scope outside ALS context");
	});

	await it("getCurrentScope returns undefined when no scope exists", async () => {
		const scope = getCurrentScope();
		assert.strictEqual(scope, undefined, "No current scope");
	});
});

describe("test-scope: Lazy scope initialization in ALS", async () => {
	await it("runScoped creates ALS context with holder", async () => {
		const holder = createLazyHolder();
		let capturedHolder: LazyHolder | undefined;
		let capturedScope: TestScope | undefined;

		await runScoped(holder, () => {
			capturedHolder = als.getStore();
			capturedScope = getOrCreateScope();
		});

		assert.strictEqual(
			capturedHolder,
			holder,
			"Runner receives original holder",
		);
		assert.ok(
			capturedScope,
			"Scope is created on first plugin call inside runScoped",
		);
		assert.strictEqual(
			holder.scope,
			capturedScope,
			"Holder.scope is set by getOrCreateScope",
		);
	});

	await it("getOrCreateScope is idempotent within same holder", async () => {
		const holder = createLazyHolder();
		let scope1: TestScope | undefined;
		let scope2: TestScope | undefined;

		await runScoped(holder, () => {
			scope1 = getOrCreateScope();
			scope2 = getOrCreateScope();
		});

		assert.strictEqual(scope1, scope2, "Same scope object returned");
	});

	await it("getCurrentScope returns holder.scope without creating", async () => {
		const holder = createLazyHolder();

		await runScoped(holder, () => {
			// First call creates it
			const s1 = getOrCreateScope();
			// Now getCurrentScope should return it
			const s2 = getCurrentScope();
			assert.strictEqual(s1, s2, "getCurrentScope returns existing scope");
		});
	});
});

describe("test-scope: Slot creation & value management", async () => {
	await it("getOrCreateSlot initializes with init() result", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<number>("@test/number-slot");

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => 42);
			assert.strictEqual(slot.value, 42, "Slot initialized to init() value");
		});
	});

	await it("getOrCreateSlot returns same slot on repeated calls", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<boolean>("@test/bool-slot");

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot1 = scope.getOrCreateSlot(KEY, () => true);
			const slot2 = scope.getOrCreateSlot(KEY, () => false);
			assert.strictEqual(slot1, slot2, "Same slot returned");
			assert.strictEqual(slot2.value, true, "Still has first init value");
		});
	});

	await it("getSlot retrieves without creating", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<string>("@test/string-slot");

		await runScoped(holder, () => {
			const scope = ensureScope();
			// Before creation
			let slot = scope.getSlot(KEY);
			assert.strictEqual(slot, undefined, "Not created yet");

			// After creation
			scope.getOrCreateSlot(KEY, () => "hello");
			slot = scope.getSlot(KEY);
			assert.ok(slot, "Slot found after creation");
			assert.strictEqual(slot?.value, "hello", "Slot has correct value");
		});
	});
});

describe("test-scope: Slot value mutation & notification", async () => {
	await it("notify() updates slot value and fires observers", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<number>("@test/notify-slot");
		const notifications: Array<[number, number]> = [];

		const observer: Observer<number> = (next, prev) => {
			notifications.push([next, prev]);
		};

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => 1);
			scope.addObserver(KEY, observer);

			slot.notify(2);
			slot.notify(3);

			assert.strictEqual(slot.value, 3, "Value is latest notified value");
			assert.strictEqual(notifications.length, 2, "Two notifications fired");
			assert.deepStrictEqual(
				notifications[0],
				[2, 1],
				"First notification is (2, 1)",
			);
			assert.deepStrictEqual(
				notifications[1],
				[3, 2],
				"Second notification is (3, 2)",
			);
		});
	});

	await it("multiple observers all fire on notify", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<number>("@test/multi-observer-slot");
		const calls: string[] = [];

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => 0);

			scope.addObserver(KEY, () => calls.push("A"));
			scope.addObserver(KEY, () => calls.push("B"));
			scope.addObserver(KEY, () => calls.push("C"));

			slot.notify(1);

			assert.strictEqual(calls.length, 3, "All observers fired");
			assert.ok(
				calls.includes("A") && calls.includes("B") && calls.includes("C"),
				"All observers called",
			);
		});
	});
});

describe("test-scope: onDispose callbacks (LIFO & error handling)", async () => {
	await it("onDispose callbacks execute in LIFO order", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<Set<string>>("@test/dispose-slot");
		const order: string[] = [];

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => new Set());

			slot.onDispose(() => {order.push("first")});
			slot.onDispose(() => {order.push("second")});
			slot.onDispose(() => {order.push("third")});
		});

		// After runScoped, drain has run
		assert.deepStrictEqual(order, ["third", "second", "first"], "LIFO order");
	});

	await it("onDispose idempotent: duplicate functions added only once", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<Set<string>>("@test/idempotent-dispose");
		let count = 0;

		const fn = () => {
			count++;
		};

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => new Set());

			slot.onDispose(fn);
			slot.onDispose(fn); // Add same function again
			slot.onDispose(fn); // Again
		});

		assert.strictEqual(count, 1, "Function runs once despite multiple adds");
	});

	await it("onDispose handles promise-returning cleanup functions", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<Set<string>>("@test/async-dispose-slot");
		const order: string[] = [];

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => new Set());

			slot.onDispose(() => {
				order.push("sync");
			});

			slot.onDispose(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				order.push("async");
			});
		});

		assert.deepStrictEqual(
			order,
			["async", "sync"],
			"Async cleanup completes, then sync",
		);
	});

	await it("single error in onDispose is rethrown", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<Set<string>>("@test/error-dispose-slot");

		await assert.rejects(
			() =>
				runScoped(holder, () => {
					const scope = ensureScope();
					const slot = scope.getOrCreateSlot(KEY, () => new Set());
					slot.onDispose(() => {
						throw new Error("Test error");
					});
				}),
			Error,
			"Test error",
		);
	});

	await it("multiple errors in onDispose are aggregated", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<Set<string>>("@test/multi-error-dispose-slot");

		await assert.rejects(
			() =>
				runScoped(holder, () => {
					const scope = ensureScope();
					const slot = scope.getOrCreateSlot(KEY, () => new Set());

					slot.onDispose(() => {
						throw new Error("Error 1");
					});
					slot.onDispose(() => {
						throw new Error("Error 2");
					});
				}),
			(err: unknown) => {
				assert.ok(err instanceof AggregateError, "AggregateError thrown");
				const agg = err as AggregateError;
				assert.strictEqual(agg.errors.length, 2, "Two errors aggregated");
				assert.strictEqual(
					(agg.errors[0] as Error).message,
					"Error 2",
					"First is last-added",
				);
				assert.strictEqual(
					(agg.errors[1] as Error).message,
					"Error 1",
					"Second is first-added",
				);
				return true;
			},
		);
	});
});

describe("test-scope: Scope-level cleanups via addCleanup", async () => {
	await it("addCleanup callbacks execute in LIFO order", async () => {
		const holder = createLazyHolder();
		const order: string[] = [];

		await runScoped(holder, () => {
			const scope = ensureScope();
			scope.addCleanup(() => {order.push("first")});
			scope.addCleanup(() => {order.push("second")});
			scope.addCleanup(() => {order.push("third")});
		});

		assert.deepStrictEqual(order, ["third", "second", "first"], "LIFO order");
	});

	await it("slot disposals run before scope cleanups", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<Set<string>>("@test/order-dispose-cleanup");
		const order: string[] = [];

		await runScoped(holder, () => {
			const scope = ensureScope();
			const slot = scope.getOrCreateSlot(KEY, () => new Set());

			scope.addCleanup(() => {order.push("scope-cleanup-1")});
			slot.onDispose(() => {order.push("slot-dispose")});
			scope.addCleanup(() => {order.push("scope-cleanup-2")});
		});

		assert.deepStrictEqual(
			order,
			["slot-dispose", "scope-cleanup-2", "scope-cleanup-1"],
			"Slot disposals run, then scope cleanups in LIFO order",
		);
	});

	await it("scope cleanup handles async functions", async () => {
		const holder = createLazyHolder();
		const order: string[] = [];

		await runScoped(holder, () => {
			const scope = ensureScope();

			scope.addCleanup(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				order.push("async-1");
			});

			scope.addCleanup(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				order.push("async-2");
			});
		});

		assert.deepStrictEqual(
			order,
			["async-2", "async-1"],
			"Async cleanups in LIFO",
		);
	});

	await it("error in scope cleanup is thrown", async () => {
		const holder = createLazyHolder();

		await assert.rejects(
			() =>
				runScoped(holder, () => {
					const scope = ensureScope();
					scope.addCleanup(() => {
						throw new Error("Cleanup error");
					});
				}),
			Error,
			"Cleanup error",
		);
	});
});

describe("test-scope: Concurrent isolation via ALS", async () => {
	await it("concurrent runScoped calls get isolated scopes", async () => {
		const KEY = defineSlotKey<{ id: number }>("@test/concurrent-isolation");
		const results: Array<{ id: number; otherIds: number[] }> = [];

		let idSeed = 0;

		const runTestA = async () => {
			const holder = createLazyHolder();
			await runScoped(holder, () => {
				const scope = ensureScope();
				const slot = scope.getOrCreateSlot(KEY, () => ({ id: ++idSeed }));
				const myId = slot.value.id;

				// Small async operation to ensure task context is maintained
				return new Promise<void>((resolve) => {
					setTimeout(() => {
						const retrieved = ensureScope().getSlot(KEY);
						results.push({
							id: myId,
							otherIds: retrieved ? [retrieved.value.id] : [],
						});
						resolve();
					}, 5);
				});
			});
		};

		const runTestB = async () => {
			const holder = createLazyHolder();
			await runScoped(holder, () => {
				const scope = ensureScope();
				const slot = scope.getOrCreateSlot(KEY, () => ({ id: ++idSeed }));
				const myId = slot.value.id;

				return new Promise<void>((resolve) => {
					setTimeout(() => {
						const retrieved = ensureScope().getSlot(KEY);
						results.push({
							id: myId,
							otherIds: retrieved ? [retrieved.value.id] : [],
						});
						resolve();
					}, 5);
				});
			});
		};

		await Promise.all([runTestA(), runTestB()]);

		// Each test should have seen its own id
		assert.strictEqual(results.length, 2, "Two results");

    if (!results[0] || !results[1]) {
      assert.fail("Results should be defined");
    }

		assert.ok(
			results[0].otherIds[0] === results[0].id &&
				results[1].otherIds[0] === results[1].id,
			"Each test maintains its own slot",
		);
		assert.notStrictEqual(
			results[0].id,
			results[1].id,
			"Different tests have different ids",
		);
	});
});

describe("test-scope: Hook registration (getScopeHooks / registerScopeHooks)", async () => {
  type GlobalWithHooks = typeof globalThis & {
    [key: symbol]: unknown;
  };
  const g = globalThis as GlobalWithHooks;
  let originalHooks: unknown;

  beforeEach(() => {
    originalHooks = g[SCOPE_HOOKS_KEY];
    delete g[SCOPE_HOOKS_KEY];
  });

  afterEach(() => {
    if (originalHooks === undefined) {
      delete g[SCOPE_HOOKS_KEY];
    } else {
      g[SCOPE_HOOKS_KEY] = originalHooks;
    }
    originalHooks = undefined;
  });

	await it("registerScopeHooks idempotently registers hooks", async () => {
		// First register
		registerScopeHooks();
		const hooks1 = getScopeHooks();
		if (!hooks1) {
			assert.fail("Hooks should be registered");
		}

		assert.ok(
			"createHolder" in hooks1 && "runScoped" in hooks1,
			"Hooks have required methods",
		);

		// Second register (should not overwrite)
		registerScopeHooks();
		const hooks2 = getScopeHooks();
		assert.strictEqual(
			hooks1,
			hooks2,
			"Same hooks instance returned (idempotent)",
		);
	});

	await it("registerScopeHooks composes with an existing provider", async () => {
		const calls: string[] = [];
		g[SCOPE_HOOKS_KEY] = {
			createHolder: () => ({ scope: { tag: "legacy" } }),
			runScoped: async (_holder: { scope: unknown }, fn: () => Promise<unknown> | unknown) => {
				calls.push("legacy:before");
				const result = fn();
				if (result instanceof Promise) await result;
				calls.push("legacy:after");
			},
		};

		registerScopeHooks();
		const hooks = getScopeHooks();

		if (!hooks) {
			assert.fail("Hooks should be available");
		}

		await hooks.runScoped(hooks.createHolder(), () => {
			calls.push("test:run");
		});

		assert.deepStrictEqual(
			calls,
			[
				"legacy:before",
				"test:run",
				"legacy:after",
			],
			"Existing provider remains visible after DOM registration",
		);
	});

	await it("getScopeHooks returns undefined before registration", async () => {
		const hooks = getScopeHooks();
		assert.strictEqual(hooks, undefined, "No hooks before registration");
	});
});

describe("test-scope: Integration - multiple slots in one scope", async () => {
	await it("scope maintains multiple independent slots", async () => {
		const holder = createLazyHolder();
		const STRINGS_KEY = defineSlotKey<string[]>("@test/strings");
		const NUMBERS_KEY = defineSlotKey<number[]>("@test/numbers");

		await runScoped(holder, () => {
			const scope = ensureScope();

			const stringsSlot = scope.getOrCreateSlot(STRINGS_KEY, () => []);
			const numbersSlot = scope.getOrCreateSlot(NUMBERS_KEY, () => []);

			stringsSlot.value.push("hello", "world");
			numbersSlot.value.push(1, 2, 3);

			assert.deepStrictEqual(
				stringsSlot.value,
				["hello", "world"],
				"String slot unchanged",
			);
			assert.deepStrictEqual(
				numbersSlot.value,
				[1, 2, 3],
				"Number slot unchanged",
			);
		});
	});

	await it("multiple slots can observe and notify independently", async () => {
		const holder = createLazyHolder();
		const KEY_A = defineSlotKey<number>("@test/observ-a");
		const KEY_B = defineSlotKey<string>("@test/observ-b");

		const callsA: Array<[number, number]> = [];
		const callsB: Array<[string, string]> = [];

		await runScoped(holder, () => {
			const scope = ensureScope();

			const slotA = scope.getOrCreateSlot(KEY_A, () => 0);
			const slotB = scope.getOrCreateSlot(KEY_B, () => "");

			scope.addObserver(KEY_A, (n, p) => callsA.push([n, p]));
			scope.addObserver(KEY_B, (n, p) => callsB.push([n, p]));

			slotA.notify(1);
			slotB.notify("x");
			slotA.notify(2);
			slotB.notify("y");
		});

		assert.deepStrictEqual(
			callsA,
			[
				[1, 0],
				[2, 1],
			],
			"A notifications",
		);
		assert.deepStrictEqual(
			callsB,
			[
				["x", ""],
				["y", "x"],
			],
			"B notifications",
		);
	});
});

describe("test-scope: Memory cleanup & GC friendliness", async () => {
	await it("_drain clears internal maps to aid GC", async () => {
		const holder = createLazyHolder();
		const KEY = defineSlotKey<number>("@test/gc-slot");

		await runScoped(holder, () => {
			const scope = ensureScope();
			scope.getOrCreateSlot(KEY, () => 42);
			scope.addCleanup(() => {});
		});

		// After drain, scope internals should be cleared
		// We verify by calling _drain again (should not error even with no slots/cleanups)
		if (holder.scope) {
			await holder.scope._drain();
			// Should complete without error
		}
	});
});
