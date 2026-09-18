# Repository Guidelines

## Source of Truth and History

Keep project knowledge in `docs/`.

- `docs/progress.md`: current stage, next action, and validation status.
- `docs/design.md`: architecture and accepted decisions.
- `docs/plan-<stage>.md`: stage plan and design.
- `docs/review-<stage>.md`: findings, feedback, and fixes.
- `docs/history.md`: dated record of completed work cycles.
- `docs/terms.md`: canonical name and meaning for each user-facing term.

Keep one section per feature. Link source files, data, commands, and review evidence. Resolve conflicts with `design.md` for decisions and `progress.md` for status.

## Required Work Cycle

Use this order for every feature or bug fix:

Role instructions: [design](docs/roles/design.md), [work](docs/roles/work.md), [review](docs/roles/review.md), [feedback](docs/roles/feedback.md), and [revision](docs/roles/revision.md).

1. **Design:** record goal, scope, SSOT files, risks, and acceptance checks.
2. **Work:** make a focused change. Update feature docs and `docs/history.md`.
3. **Review:** run relevant checks. Record commands and results.
4. **Feedback:** list failures, ambiguity, and review comments.
5. **Revision:** fix findings, rerun checks, and update all records.

Do not commit or push with open findings. For design-only work, stop after Design and mark implementation as not started.

## ASD-STE100 Writing

[`docs/README.md`](docs/README.md) is the source of truth for the writing policy, the evidence priority when documents disagree, and the document map. Follow it for every file listed there. In short: one fact per sentence, exact identifiers, one term per concept, condition before action, no vague or marketing language, dates as `YYYY-MM-DD`. Korean text follows these principles for clarity; it does not claim formal Korean ASD-STE100 compliance.

## Project Structure

- `src/`: TypeScript runtime. Main process is in `src/main/`; other features are grouped by module.
- `src/renderer/`: stage and picker windows.
- `data/`: editable rules and species data. `lib/`: generated or compatibility JavaScript.
- `art/`, `assets/`: sprite and logo assets. `scripts/`, `bin/`, `helpers/`: packaging tools.
- `vscode-extension/`: VS Code companion. `docs/`: records.

## Build and Test Commands

Use Node.js `>=22.12` and npm.

```powershell
npm install                 # install dependencies and run postinstall
npm run build               # compile main and renderer to dist/
npm run check               # type-check without output
npm run selftest            # build and run all self-tests
npm start                   # build and launch Electron
npm run data:build          # rebuild generated data
npm run build:vsix          # package the VS Code extension
```

Run a focused check, such as `node dist/tools/selftest-shop.js`, after building.

## Style and Naming

Use TypeScript. Follow nearby files for two-space indentation, semicolons, and single quotes. Use `camelCase` for values and functions, `PascalCase` for types and classes, and kebab-case for CLI commands and data files. Rebuild after source changes; never edit `dist/` by hand. Keep strings in i18n files.

## Commits, PRs, and Safety

Use short imperative subjects, such as `feat: S4 해금·상점·진화` or `docs: add S5 settings design preview`. Keep commits focused. PRs describe behavior, checks, plan or issue links, and UI screenshots when relevant. Use temporary data or HOME paths. Treat saves, hooks, and mailbox data as user-owned. Preserve Electron IPC checks, context isolation, and sandbox settings.
