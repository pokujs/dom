# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

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
