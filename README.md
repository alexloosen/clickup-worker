# ClickUp Worker

A Codex plugin that connects your ClickUp tasks to your GitHub repository and starts a coding chat in a worktree or the existing checkout with the complete implementation prompt for each selected task. No dispatcher chat is created. The panel is named **ClickUp Tasks**; the stable plugin ID remains `puppeteer-bugs`.

## Install

Install Node.js 20+, Git and Codex desktop first. The `codex` CLI must be available in your terminal. Direct chat creation requires a desktop host exposing the native app-tools bridge; the CLI alone is insufficient.

Clone or download this repository, then run the installer from its root:

| Platform | Command |
| --- | --- |
| Windows PowerShell | `.\Install-Windows.ps1` |
| macOS Terminal | `sh install.sh` |
| Linux terminal | `sh install.sh` |

No npm install is required for normal use. The bundled server and UI are included. Install as your normal user, without sudo. Restart Codex after installing, open **ClickUp Tasks**, then choose **Setup** in the top-right corner of the task panel. This is inside the panel, separate from Codex's plugin details page. The header shows the loaded version.

Setup asks for your ClickUp workspace/Space/Folder/List URL, API token, GitHub repository URL, local checkout folder and target branch. Add that checkout as a local Git project in Codex first. Use your own Git credential helper or GitHub CLI login for GitHub access.

If you already have the account-installed plugin, use `.\Install-Windows.ps1 -ConnectionOnly` or `sh install.sh --connection-only` to update the native connection without installing a second copy. This mode does not update the installed plugin package or its displayed version; the account-installed release must be updated separately.

To use this Git checkout as the plugin source, run `.\Install-Windows.ps1 -UseCheckout` or `sh install.sh --use-checkout`. This registers the marketplace and native server directly from this repository and verifies the installed package version and source path. Keep the checkout at this location, and rerun the same command after pulling or rebuilding. If an older account-installed copy is also enabled, disable that copy in Codex Plugins to avoid duplicate skills and panels.

Without the checkout option, the installer copies the bundled runtime to a stable per-user location. Rerun it after pulling an update. Both modes back up Codex configuration and leave approval and sandbox settings unchanged.

## Credentials and local data

Windows protects the token with DPAPI. macOS and Linux store it in a separate **plaintext, owner-only** token file (0600) in a private directory (0700); they do not use Keychain or Secret Service. Never share your data directory. Removing the saved token is available in Setup. An explicit `CLICKUP_API_TOKEN` environment override takes precedence when supplied to the server.

| Platform | Default data directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ClickUpTasks` |
| macOS | `~/Library/Application Support/ClickUpTasks` |
| Linux | `$XDG_DATA_HOME/ClickUpTasks`, default `~/.local/share/ClickUpTasks` |

The installer uses a sibling `ClickUpTasksPlugin` directory for package files. `PUPPETEER_BUGS_DATA_DIR` or host-provided `PLUGIN_DATA` can override the data location. No credentials, personal project configuration or saved tasks are included in this repository.

## Sharing and troubleshooting

Friends with access can clone/download this repository and run the installer with their own settings. Installing the local marketplace does not publish a plugin listing. Repository visibility is managed in GitHub; the installer never changes it.

If the bridge is unavailable, rerun the installer and fully restart Codex. Ask Codex to run `get_direct_launch_status` for a read-only check. No real task is started by installation. The bridge depends on the desktop host and may require adaptation after host changes. macOS/Linux installation and file-permission checks are covered by CI; interactive desktop launches need verification on each target host.

To remove the connection: `codex mcp remove puppeteer-bugs-panel`. Remove the local plugin/marketplace through Codex Plugins. Local data is retained.

## Development

From `plugins/puppeteer-bugs/source`: `npm ci`, `node build.mjs`, `node test.mjs`. CI runs the full functional suite and `node test-platform.mjs` on Windows, macOS and Linux. Tests use temporary data and repositories; they never create real coding chats or publish changes. Interactive desktop launches still need a smoke test on each target host.

Run `node preview.mjs` from the source folder for a loopback-only UI preview with synthetic tasks. Optional URL parameters: `?theme=dark`, `?scenario=pending`, `?scenario=recovery`, or `?scenario=empty`. It never contacts ClickUp or GitHub.

## Sharing and updating with other developers

Version **0.14.0** adds visible Refresh and Board tools controls, readiness checks, direct chat navigation, accurate delivery labels, and recovery for interrupted operations. Each developer installs their own copy and enters their own token and repository settings. Share the package or repository, **never your local data directory**.

After installation, open **Setup**, save the project, then choose **Board tools → Check setup readiness**. Refresh the board and try one task in worktree/PR mode before starting a batch. Verify that its chat opens from the panel and that its status updates. Local-commit mode changes the existing checkout; only use it when that checkout is free for the task.

To update: stop plugin operations and task chats, keep the previous package, run the new installer using the same mode as before, and fully restart Codex. Check the version in the panel. Do not run old and new plugin server versions against the same local data directory at the same time. Connection-only installs still require a separate update of the account-installed plugin.

To roll back: stop the app, reinstall the previous package using its installer, and restart. This release retains state format version 1. Keep a private copy of the data directory before rolling back; restore an older data snapshot only after checking chats, PRs, and ClickUp for work performed since that snapshot. Installer configuration backups are available beside `config.toml`; restoring one replaces all changes made to that configuration since the backup.

## Recovering interrupted work

- Locks created by this version identify their owning process. A dead process's lock is recovered automatically; live operations are never unlocked merely because they are slow. Locks from older versions require **Board tools → Recover local data**, after stopping prior operations and restarting Codex.
- A readable previous snapshot is kept in `state.json.backup`. An unreadable board opens in recovery mode. The recovery action preserves the original files before restoring a backup or explicitly resetting the board. It never creates chats or posts comments. Inspect existing work before retrying anything; a backup may predate the latest external action.
- Definite ClickUp rejections allow a comment retry. Lost responses remain protected against duplicates. **Ticket options → Recover comment attempt** rechecks ClickUp and requires you to inspect the previous attempt before unlocking a retry. Then retry the original action in its existing task chat or use Mark finished again.
- New task chats register their verified identity with the panel. If no final chat identity appears after two minutes, the panel shows **Launch needs attention**. Codex currently exposes no API to resolve a pending `clientThreadId`; do not treat one as a real chat ID. Use **Ticket options → Verify & reconnect** with the final ID of the original chat, or ask that chat to call `register_bug_worker` with its original task and launch IDs. Reconnection verifies the launch ID in the chat's history. Stop a failed or abandoned launch before releasing its assignment.

The board refreshes from ClickUp when opened, on **Refresh**, when changing a server-side filter, and before launching work. Background polling only checks local progress; the visible Updated timestamp shows the last ClickUp refresh. Polling uses change detection and omits stored history and cached comments. Comments load for the selected task and the cache retains at most 30 tasks. Delivery history and recovery copies remain local until you remove them.

Task descriptions, comments, and additional context are included in the coding or investigation chat. Keep that in mind when choosing which tasks to launch. To remove local data, stop Codex and remove the data directory listed above after saving any records you need. Removing the token or uninstalling the connection alone does not erase task history or recovery copies.

See [task delivery and setup details](plugins/puppeteer-bugs/README.md).
