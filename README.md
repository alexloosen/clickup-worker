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

From `plugins/puppeteer-bugs/source`: `npm ci`, `node build.mjs`, `node test.mjs` (the full legacy task suite runs on Windows). `node test-platform.mjs` covers OS paths, token persistence/permissions and installer configuration on all three platforms. CI runs these checks; tests never create real coding chats.

See [task delivery and setup details](plugins/puppeteer-bugs/README.md).
