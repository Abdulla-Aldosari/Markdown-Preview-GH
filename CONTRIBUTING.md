# Contributing

Thank you for helping with Markdown Preview GH. Bug reports, ideas, and pull requests are welcome at <https://github.com/Abdulla-Aldosari/Markdown-Preview-GH/issues>.

## Set up

You need Node.js 22.18 or later (the project runs its TypeScript files directly through Node's type stripping, which is on by default from that version) and npm.

```bash
npm install
npm run build
```

Press `F5` in VS Code to start an Extension Development Host with the extension loaded (the **Launch Extension** configuration builds first).

## Commands

| Command             | What it does                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| `npm run build`     | Generates the theme stylesheets and bundles `src/` into `dist/`.                        |
| `npm run watch`     | Rebundles on every change.                                                              |
| `npm run typecheck` | Type checks the project (`strict`, no emit).                                            |
| `npm test`          | Runs the unit tests (`test/*.test.mts`) with the built-in `node:test` runner.           |
| `npm run test:e2e`  | Runs the UI tests in a real VS Code window with Playwright (run `npm run build` first). |
| `npm run test:web`  | Opens the extension in VS Code for the Web to check the web bundle by hand.             |
| `npm run package`   | Builds the production bundle and packs the `.vsix` file.                                |

Before you open a pull request, run `npm run typecheck && npm test`, and `npm run build` when you changed `src/`, `build/`, or `package.json`.

## Code and tests

- The source is TypeScript in `src/*.mts`. Use the `.mts` extension for new files, write relative imports with the full `.mts` extension, and use only syntax that Node can strip (no `enum`, no value `namespace`, no parameter properties).
- Only `src/extension.mts` and its two entry files import `vscode`. Logic that needs the editor goes into a pure module that receives what it needs as arguments, so a unit test can run it in plain Node.
- Add or update a test in `test/` for every change in behavior.
- `dist/` is generated. Never edit it by hand.

## Commits

Commit messages follow the conventional commits format with a required scope, for example `fix(blockImage): keep the progress bar up`. The allowed types and scopes are listed in `commitlint.config.js`, and a git hook checks every message. A git hook also formats the staged files with Prettier.

## Where to read more

[docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) describes the modules, the data flow, the settings, and the tests.
