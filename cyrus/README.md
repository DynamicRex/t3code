# Cyrus's T3 Code

Official T3 Code (pingdotgg/t3code) plus a few patches, released from this fork.

- **Install** (Windows PowerShell): `irm https://raw.githubusercontent.com/DynamicRex/t3code/flow/cyrus/install.ps1 | iex`
- **Install** (Linux): `curl -fsSL https://raw.githubusercontent.com/DynamicRex/t3code/flow/cyrus/install.sh | bash`
- **Update** a machine to the newest release: `t3 update`
- **Release**: Actions → Cyrus release → Run workflow on `flow`.

`t3-settings.json` and `claude.json` are the settings every install applies. Change them here, then rerun the installer.

## Patches

`git log upstream/main..flow` lists them: the focus band (`apps/web/src/flow/`), plugin `commands/*.md` as skills (`ClaudeSkills.ts`), `t3 update` reading this fork's releases (`cliRelease.ts`), and this folder plus `.github/workflows/cyrus-release.yml`.

## Sync with official T3

1. `git fetch https://github.com/pingdotgg/t3code.git main:refs/remotes/upstream/main`
2. In a worktree off `flow`: `git rebase upstream/main`. Drop a patch that official T3 now covers.
3. `vp install`, then `vp test run apps/server/src/provider/Drivers/ClaudeSkills.test.ts`, the web typecheck (`tsc --noEmit -p apps/web`), and `vp run --filter t3 build`.
4. Check the focus band in the built app, then force-push `flow`.
5. Disable any new official workflow: `gh workflow list` → `gh workflow disable <name>`. Only Cyrus release runs here.
6. Release.
