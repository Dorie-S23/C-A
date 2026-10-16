# C-A - The Amazing Digital Circus (CGV project)

**Deployed game:** https://wmc.ms.wits.ac.za/students/sgroup3913/index.html

## Requirements

- Node.js 22.12 or newer (Node 24 LTS recommended; see `.nvmrc`).
- Tested with Node 24.18.1 and npm 12.2.0.
- Use the npm that ships with Node. Do not use yarn or pnpm: `package-lock.json` is the source of truth for dependency versions.

### Pinned dependencies

Exact versions come from `package-lock.json`:

| Package          | Version | Notes                                                        |
| ---------------- | ------- | ------------------------------------------------------------ |
| `three`          | 0.169.0 |                                                              |
| `three-mesh-bvh` | 0.8.3   | Bundled into the build by Vite; imported from `src/main.js`  |
| `vite`           | 5.4.21  | Dev dependency                                               |

## Commands

| What                                                        | Command           |
| ----------------------------------------------------------- | ----------------- |
| Install dependencies (clean, reproducible, from the lockfile) | `npm ci`        |
| Run the game locally (Vite dev server, http://localhost:5173) | `npm run dev`   |
| Build for deployment (to `dist/`, relative paths so it can be hosted in a subdirectory) | `npm run build` |
| Check the built game locally                                | `npm run preview` |
| Run the dialogue, collision, and Level 2 picture collection/scoring checks | `npm test` |
| Run only the Level 2 regression checks (no browser or model assets needed) | `node --test _verify_level2.mjs` |
| Build and package for the LAMP server                       | `npm run package` |

> **Windows PowerShell:** if npm reports that `npm.ps1` cannot run because scripts are disabled, use `npm.cmd` instead of `npm` (for example, `npm.cmd ci` and `npm.cmd run dev`).

## Pushing your branch

Check `git status` and commit the files you intend to publish first. For the first push of the current branch, run:

```sh
git push --set-upstream origin HEAD
```

Subsequent pushes can use `git push`.

## Changing dependencies

Only use `npm install <package>` when you intend to add or change a dependency, then commit `package.json` and `package-lock.json` together - `npm ci` fails if they disagree.

npm 12 blocks dependency install scripts unless they are listed under `"allowScripts"` in `package.json`. After changing dependencies, run `npm install-scripts ls` and keep the list matching the locked versions.

## Deploying to the LAMP server

```sh
npm run package
```

This builds the game and writes `release/cgv-game-deploy.zip` containing only the files the game loads (`index.html` at the top). It stops if a file is missing or its name's upper/lower case differs from the code (the server is Linux).

1. Test it first: `npx serve release/site`
2. In the File Manager, upload the zip.
3. Click it and choose **UnZip** (not "UnZip to folder").
4. Delete the zip.

### CI

GitHub Actions ([`.github/workflows/build.yml`](.github/workflows/build.yml)) runs `npm test` and `npm run package` on every push and pull request to `main`. Each run's Summary page has a **cgv-game-deploy** download: that zip is the same deploy zip.

## Project tracker

[Jira - KAN](https://tadccgv.atlassian.net/jira/software/projects/KAN/summary)
