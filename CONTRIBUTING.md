# Contributing

This repository is the independent source for EPP Skills and plugin configuration. Preserve the existing marketplace and plugins/epp installation paths. Use synthetic data and temporary directories in tests. Run `npm test`; build a release ZIP with `npm run pack` after committing the reviewed public files. No private EPP checkout, API credentials or database is required.

Contract/API changes require compatibility review with the EPP service. Ordinary PRs modify this repository directly. CI is read-only and never publishes or modifies user configurations. Installation upgrades and release publishing require separate maintainer review.

Changes are maintained and reviewed here. The private EPP checkout has no editable plugin copy or copy-sync entry points; do not reintroduce dual maintenance.

## Scripts and command entry points

Keep scripts with the scope they serve:

- `scripts/`: repository maintenance, including release ZIP creation; not shipped in the ZIP.
- `plugins/epp/scripts/`: plugin configuration tools that also run from an extracted or installed plugin.
- `plugins/epp/skills/<skill>/scripts/`: helpers owned by that Skill, shipped with its instructions and resources.

Expose repository commands directly through `package.json`, using `plugin:*`, `practice:*` and `test:*` for scoped commands. Keep `npm test` and `npm run pack` as the aggregate test and packaging entries. Do not add forwarding scripts or move Skill helpers into repository tooling just to shorten a command.

Repository integration tests live in `tests/`. The portable configuration self-check remains in `plugins/epp/tests/` so it can also verify an extracted ZIP. `npm test` includes both. Focused checks use `npm run test:config`, `npm run test:schedule` and `npm run test:pack`.

Document npm commands in the repository README. Keep direct Node.js commands in the shipped `plugins/epp/README.md` and Skill instructions: the ZIP and installed plugin do not include the repository `package.json` or require npm dependencies. Changes to command entry points must preserve those independent uses and their ZIP regression tests.
