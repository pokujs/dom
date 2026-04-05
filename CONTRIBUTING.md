# Contributing

Thank you for contributing to @pokujs/dom.

## Setup

1. Install dependencies:

```sh
npm ci
```

2. Run checks:

```sh
npm run check
```

## Development Guidelines

- Keep shared logic framework-agnostic.
- Preserve adapter-specific semantics in wrapper packages.
- Add tests for every behavior change in shared modules.

## Test Commands

```sh
npm test
npm run test:bun
npm run test:deno
npm run typecheck
```

## Pull Requests

Please include:

- What changed and why.
- Tests added or updated.
- Any migration impact for adapter packages.
