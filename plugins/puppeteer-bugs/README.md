# ClickUp Tasks 0.14.0

A Codex plugin for your own ClickUp project and GitHub repository. Browse tasks and comments, save filters, and send selected tasks into worktree chats or the existing checkout.

## Private installation

Use `Install-Windows.ps1` on Windows or `sh install.sh` on macOS/Linux from the repository root. It registers a local plugin marketplace and the plugin's native MCP connection. Nothing is published to the public directory. The portable account package alone cannot forward the Codex connection needed for direct chat creation.

Prerequisites: a Codex desktop host that exposes the app-tools bridge with its `codex` command available, Node.js 20 or later, Git, a local clone already added as a Codex project, and GitHub authentication through that clone's Git credential helper or GitHub CLI. No npm installation is required to use the bundled plugin.

After installation, restart Codex. Open the **ClickUp Tasks** panel and choose **Setup** in its top-right corner. The header and the read-only Plugin version field in Setup show the loaded version. One temporary local page contains:

- ClickUp project link: workspace, Space overview, Folder overview or List. Task links and custom view links are rejected with an explanation. The link sets the initial board filter; you can browse other accessible lists in that workspace.
- ClickUp personal API token: saved using Windows DPAPI on Windows, or a separate plaintext file with owner-only permissions (0600) inside a private directory (0700) on macOS/Linux, never sent to chat. Leave blank when updating setup to retain the saved token. Remove saved API token disconnects it. An explicit CLICKUP_API_TOKEN environment override takes precedence.
- GitHub repository URL: standard github.com HTTPS or SSH repository identity; GitHub Enterprise is not supported in this release.
- Local repository folder: the absolute root directory of that repository, already added as a local Git project in Codex. The origin must match the URL.
- Target branch: an existing local branch, such as main or develop, used for new worktrees and PRs.

Setup checks the repository and ClickUp access before saving. Failed checks keep previous settings. Finish or stop and release outstanding assignments before switching projects. Configuration, tokens and board history stay in the user's local data directory and are never part of the ZIP.

## Tasks and completion

Implement task creates exactly one new coding chat per selected task, with the selected checkout mode and the full description, paginated comments, additional context, delivery mode, model and thinking level. Codex controls chat approvals; the plugin does not override them. Duplicate and uncertain launch attempts stay locked until inspected. The session bridge depends on the installed Codex host and may need an update if that host changes; get_direct_launch_status is a read-only diagnostic.

In Ticket options > Work mode & delivery, choose **Existing checkout - implement and commit** for small fixes. This uses the current branch, preserves unrelated work and commits locally without pushing or creating a PR. Only one plugin local task can run at a time; avoid editing the same checkout in another chat while it runs. Mark finished verifies that the local commit is still contained in the checkout and retains its branch and files.

PR delivery is the default. Direct delivery is an explicit per-task option and uses a normal fast-forward push to the configured target. The internal compatibility value `direct_develop` does not hardcode the target branch. PR comments use this plugin's configured ClickUp connection, with duplicate and uncertain-write protection; no separate ClickUp connector is required.

**Investigate task** starts a separate read-only chat in the configured checkout, using the selected model, thinking and additional context. It examines existing scripts, prefabs and scene wiring, then comments on whether the functionality already exists, needs existing scripts refactored, requires new scripts, or needs more evidence. Comments use plain language for the whole team: what already works, what is missing, up to three recommended changes, any design decision and a brief verification limit. They target 100–150 words, with a maximum of 180 words and 2000 characters for the findings; detailed technical evidence stays in the investigation chat. Every concluded investigation sets **Review Requested**. Implementation remains a separate action and receives the latest ClickUp comments, including the investigation. A failed review status update can be retried without posting the comment again.

**Cancel ticket** is in the three-dot Ticket options menu. It sets the ticket to the list's **Cancelled** status without requiring a fix, PR or commit. Stop and release an active assignment first. Cancelled tickets appear with finished tickets; cancellation does not delete repository work.

In Progress and Review Requested are synchronized from verified coding progress. Use list workflow mappings if your lists use different status names. Mark finished confirms user testing and acceptance, verifies the merged PR or authorized published commit, adds an acceptance comment and cleans up only the exact recorded branch at its verified commit. Dirty or advanced branches are preserved. Clean linked worktrees are removed after acceptance, including generated files. The primary checkout is retained. PRs are never merged automatically.

**Clean old worktrees** rechecks recorded accepted deliveries and removes matching clean linked worktrees, including detached copies left by older versions. Confirm the associated coding chats have stopped. Dirty, locked, changed, primary and unverified worktrees are preserved; no folders are deleted merely because they are old. Generated files inside removed worktrees are also deleted.

Filters, saved presets, task comments and timezone follow each user's setup. Changes in project setup preserve older work records locally; stale launch IDs cannot update new assignments. The plugin never changes assignees automatically.

## Panel and recovery

**Refresh** fetches the latest ClickUp tasks without opening Setup. The header shows the connected repository, actual target branch and last refresh time. **Board tools** contains the readiness check, list-directory refresh and local-data recovery. **Coding chat** navigates directly without sending an agent message. Local-only commits and retained checkouts are labelled explicitly.

New worker chats call `register_bug_worker` after checking their repository identity. Pending launches that remain unconfirmed show **Launch needs attention** after two minutes. Codex does not currently provide a lookup API for pending chat IDs. Reconnect the original chat from Ticket options using its final ID; the plugin verifies its launch ID in the chat history. Never retry creation until the previous launch has been checked and stopped.

Dead-process locks recover automatically. Old ownerless locks and corrupted board data have an explicit recovery flow that preserves the original files. A previous state snapshot is kept as `state.json.backup`. Stop previous operations and inspect ClickUp and coding chats before restoring or resetting; a snapshot may be older than a completed external action.

Definite API rejections no longer permanently block comments. Uncertain outcomes retain duplicate protection and can be inspected with **Ticket options → Recover comment attempt**. That action checks for an existing comment and unlocks a user-confirmed retry; it never posts by itself.

For updates, stop running tasks, rerun the installer in the same mode, and fully restart Codex. Keep the previous package for rollback. Never share the data directory: task content, settings, history and preserved recovery files are private. The main repository README includes recovery, rollback and data-removal instructions.

## Data and sharing

Only package source, bundled server/UI, schemas, synthetic tests, skills and installation instructions are distributed. There are no account IDs, private repository defaults, local user paths, tokens, saved tasks, or required third-party connector bindings in the package. `PLUGIN_DATA` is used if the host provides it; otherwise data is stored under `%LOCALAPPDATA%\ClickUpTasks` on Windows, `~/Library/Application Support/ClickUpTasks` on macOS, and `$XDG_DATA_HOME/ClickUpTasks` (default `~/.local/share/ClickUpTasks`) on Linux. Keep that directory private.

Send the ZIP directly to friends, or put this marketplace in a private Git repository and invite them. Local marketplaces are separate from the public plugin directory: https://developers.openai.com/plugins/build/plugins

For source development: run `npm ci` in source, `node build.mjs`, then `node test.mjs`. Tests use synthetic identities and disposable local repositories; they do not launch real coding tasks or publish changes.
