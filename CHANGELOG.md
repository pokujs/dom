# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [1.3.1](https://github.com/pokujs/dom/compare/dom-v1.3.0...dom-v1.3.1) (2026-04-22)


### Bug Fixes

* use --preload for Bun instead of --import ([#16](https://github.com/pokujs/dom/issues/16)) ([7db0e16](https://github.com/pokujs/dom/commit/7db0e168d224e7839892460fa90f3591a84d9970))

## [1.3.0](https://github.com/pokujs/dom/compare/dom-v1.2.0...dom-v1.3.0) (2026-04-20)


### Features

* add ALS-based test scope hooks foundation ([#14](https://github.com/pokujs/dom/issues/14)) ([80cda0f](https://github.com/pokujs/dom/commit/80cda0fff376b0b782125c6901d7b1e5a3f9ea40))

## [1.2.0](https://github.com/pokujs/dom/compare/dom-v1.1.2...dom-v1.2.0) (2026-04-05)


### Features

* add commandBuilder hook to FrameworkDescriptor ([#6](https://github.com/pokujs/dom/issues/6)) ([b6d7ecd](https://github.com/pokujs/dom/commit/b6d7ecdbaa38f03f664e388192c031bead76fb12))


### Bug Fixes

* lazily re-evaluate screen queries on each access ([#1](https://github.com/pokujs/dom/issues/1)) ([4ac921a](https://github.com/pokujs/dom/commit/4ac921aa9a9c96eb75937ffe4c9d4a5240e6f703))
* preserve native dispatchEvent for Deno compatibility ([#7](https://github.com/pokujs/dom/issues/7)) ([a510a86](https://github.com/pokujs/dom/commit/a510a86696b6ccfbc7750a77507683760ca4dd51))
* preserve native Event/dispatchEvent in jsdom setup for Deno compatibility ([#9](https://github.com/pokujs/dom/issues/9)) ([3e734f6](https://github.com/pokujs/dom/commit/3e734f6a6591c18b7d3f2744cc64b5667307a3d9))
* preserve node builtin specifiers in published ESM output ([f034757](https://github.com/pokujs/dom/commit/f034757e35dac9becd14115f31e78c6945395029))
* preserve node builtin specifiers in published ESM output ([#5](https://github.com/pokujs/dom/issues/5)) ([09ef83b](https://github.com/pokujs/dom/commit/09ef83b5fad0ff84a528133342c7175ec071445e))


### Performance Improvements

* cache createScreen queries by body ref + add wrapFireEventMethods helper ([#11](https://github.com/pokujs/dom/issues/11)) ([6bb4ffa](https://github.com/pokujs/dom/commit/6bb4ffa2b1e4abe488a057786802879334c0f6b3))

## [1.1.2](https://github.com/pokujs/dom/compare/v1.1.1...v1.1.2) (2026-04-05)


### Bug Fixes

* preserve native Event/dispatchEvent in jsdom setup for Deno compatibility ([#9](https://github.com/pokujs/dom/issues/9)) ([3e734f6](https://github.com/pokujs/dom/commit/3e734f6a6591c18b7d3f2744cc64b5667307a3d9))

## [1.1.1](https://github.com/pokujs/dom/compare/v1.1.0...v1.1.1) (2026-04-05)


### Bug Fixes

* preserve native dispatchEvent for Deno compatibility ([#7](https://github.com/pokujs/dom/issues/7)) ([a510a86](https://github.com/pokujs/dom/commit/a510a86696b6ccfbc7750a77507683760ca4dd51))

## [1.1.0](https://github.com/pokujs/dom/compare/v1.0.1...v1.1.0) (2026-04-05)


### Features

* add commandBuilder hook to FrameworkDescriptor ([#6](https://github.com/pokujs/dom/issues/6)) ([b6d7ecd](https://github.com/pokujs/dom/commit/b6d7ecdbaa38f03f664e388192c031bead76fb12))


### Bug Fixes

* preserve node builtin specifiers in published ESM output ([f034757](https://github.com/pokujs/dom/commit/f034757e35dac9becd14115f31e78c6945395029))
* preserve node builtin specifiers in published ESM output ([#5](https://github.com/pokujs/dom/issues/5)) ([09ef83b](https://github.com/pokujs/dom/commit/09ef83b5fad0ff84a528133342c7175ec071445e))

## [1.0.1](https://github.com/pokujs/dom/compare/v1.0.0...v1.0.1) (2026-04-05)


### Bug Fixes

* lazily re-evaluate screen queries on each access ([#1](https://github.com/pokujs/dom/issues/1)) ([4ac921a](https://github.com/pokujs/dom/commit/4ac921aa9a9c96eb75937ffe4c9d4a5240e6f703))

## 1.0.0 (2026-04-05)


### Bug Fixes

* lazily re-evaluate screen queries on each access ([#1](https://github.com/pokujs/dom/issues/1)) ([4ac921a](https://github.com/pokujs/dom/commit/4ac921aa9a9c96eb75937ffe4c9d4a5240e6f703))

## [0.1.0] - 2026-04-05

### Added

- Initial public release of @pokujs/dom.
- Shared runtime options parsing.
- Shared plugin command and setup utilities.
- Shared metrics normalization and reporting helpers.
- Shared DOM environment helpers for happy-dom/jsdom.
- Shared testing runtime primitives for adapter packages.
- CI/CD, CodeQL, publish, and compatibility workflows.
