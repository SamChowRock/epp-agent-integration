# Contributing

This repository is the independent source for EPP Skills and plugin configuration. Preserve the existing marketplace and plugins/epp installation paths. Use synthetic data and temporary directories in tests. Run `npm test`; build a release ZIP with `npm run pack` after committing the reviewed public files. No private EPP checkout, API credentials or database is required.

Contract/API changes require compatibility review with the EPP service. Ordinary PRs modify this repository directly. CI is read-only and never publishes or modifies user configurations. Installation upgrades and release publishing require separate maintainer review.

Changes are maintained and reviewed here. The private EPP checkout has no editable plugin copy or copy-sync entry points; do not reintroduce dual maintenance.
