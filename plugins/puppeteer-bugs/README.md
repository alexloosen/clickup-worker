# ClickUp Tasks 0.12.0

A Codex plugin for your own ClickUp project and GitHub repository. Browse tasks and comments, save filters, and send selected tasks directly into isolated worktree chats.

## Private installation

Use `Install-Windows.ps1` on Windows or `sh install.sh` on macOS/Linux from the repository root. It registers a local plugin marketplace and the plugin's native MCP connection. Nothing is published to the public directory. The portable account package alone cannot forward the Codex connection needed for direct chat creation.

Prerequisites: a Codex desktop host that exposes the app-tools bridge with its `codex` command available, Node.js 20 or later, Git, a local clone already added as a Codex project, and GitHub authentication through that clone's Git credential helper or GitHub CLI. No npm installation is required to use the bundled plugin.

After installation, restart Codex. Open **ClickUp Tasks → gear menu → Setup**. One temporary local page contains:

- ClickUp project link: workspace, Space overview, Folder overview or List. Task links and custom view links are rejected with an explanation. The link sets the initial board filter; you can browse other accessible lists in that workspace.
- ClickUp personal API token: saved using Windows DPAPI on Windows, or a separate plaintext file with owner-only permissions (0600) inside a private directory (0700) on macOS/Linux, never sent to chat. Leave blank when updating setup to retain the saved token. Remove saved API token disconnects it. An explicit CLICKUP_API_TOKEN environment override takes precedence.
- GitHub repository URL: standard github.com HTTPS or SSH repository identity; GitHub Enterprise is not supported in this release.
- Local repository folder: the absolute root directory of that repository, already added as a local Git project in Codex. The origin must match the URL.
- Target branch: an existing local branch, such as main or develop, used for new worktrees and PRs.

Setup checks the repository and ClickUp access before saving. Failed checks keep previous settings. Finish or stop and release outstanding assignments before switching projects. Configuration, tokens and board history stay in the user's local data directory and are never part of the ZIP.

## Tasks and completion

Implement task creates exactly one new coding chat per selected task, with a worktree from the configured branch and the full description, paginated comments, additional context, delivery mode, model and thinking level. Codex controls chat approvals; the plugin does not override them. Duplicate and uncertain launch attempts stay locked until inspected. The session bridge depends on the installed Codex host and may need an update if that host changes; get_direct_launch_status is a read-only diagnostic.

PR delivery is the default. Direct delivery is an explicit per-task option and uses a normal fast-forward push to the configured target. The internal compatibility value `direct_develop` does not hardcode the target branch. PR comments use this plugin's configured ClickUp connection, with duplicate and uncertain-write protection; no separate ClickUp connector is required.

In Progress and Review Requested are synchronized from verified coding progress. Use list workflow mappings if your lists use different status names. Mark finished confirms user testing and acceptance, verifies the merged PR or authorized published commit, adds an acceptance comment and cleans up only the exact recorded branch at its verified commit. Dirty or advanced branches are preserved. Worktree files are retained. PRs are never merged automatically.

Filters, saved presets, task comments and timezone follow each user's setup. Changes in project setup preserve older work records locally; stale launch IDs cannot update new assignments. The plugin never changes assignees automatically.

## Data and sharing

Only package source, bundled server/UI, schemas, synthetic tests, skills and installation instructions are distributed. There are no account IDs, private repository defaults, local user paths, tokens, saved tasks, or required third-party connector bindings in the package. `PLUGIN_DATA` is used if the host provides it; otherwise data is stored under `%LOCALAPPDATA%\ClickUpTasks` on Windows, `~/Library/Application Support/ClickUpTasks` on macOS, and `$XDG_DATA_HOME/ClickUpTasks` (default `~/.local/share/ClickUpTasks`) on Linux. Keep that directory private.

Send the ZIP directly to friends, or put this marketplace in a private Git repository and invite them. Local marketplaces are separate from the public plugin directory: https://developers.openai.com/plugins/build/plugins

For source development: run `npm ci` in source, `node build.mjs`, then `node test.mjs`. Tests use synthetic identities and disposable local repositories; they do not launch real coding tasks or publish changes.
