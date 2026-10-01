---
name: panel-workflow
description: Open the ClickUp Tasks panel, configure a user's project, refresh tasks, or launch explicitly selected tasks in isolated Codex worktree chats.
---

# ClickUp Tasks panel

Discover the actual host-prefixed tools. open_bug_board opens the panel; get_bug_board_state reads local state; refresh_bug_board reads ClickUp directly. Setup is in the panel's top-right header, the board utilities menu, and open_clickup_settings. The header shows the loaded version. API tokens are entered only in the temporary local page and stored locally (DPAPI on Windows; owner-only token file on macOS/Linux). Never request or expose tokens in chat.

The user configures a ClickUp workspace, Space, Folder or List link, GitHub repository URL, absolute local checkout and existing target branch. The checkout must already be added as a local Git project in Codex. There are no fixed workspace IDs, repository owners, Codex project IDs, user paths or target branches. The user's local Git/GitHub login is used for repository operations.

Implement task and Start selected authorize one new worktree chat per selected task. Use start_bug_implementations with the selected IDs and each task's delivery, model, thinking and additional context. It verifies the configured saved project, reads fresh descriptions and comments, reserves against duplicates and directly calls native chat creation. Preserve the full immutable prompt. Do not create a dispatcher chat or send the task into an existing chat. A pending clientThreadId is distinct from a real threadId. Do not automatically retry uncertain creation; the assignment stays locked.

The direct bridge requires a local installation using the installer for the operating system and a Codex restart. The portable account package alone cannot forward the native connection environment variable. get_direct_launch_status diagnoses availability without launching a task. Do not discover private sockets, hardcode a connection address, create alternate Codex runtimes or change host permissions. Report unavailable host capabilities accurately.

record_bug_work uses the exact launch ID and genuine progress. review_requested requires a PR in the configured repository; completed requires explicitly selected direct delivery and a verified published commit. Session statuses map to ClickUp In Progress and Review Requested; set_list_workflow configures explicit alternative names. Report sync_error and use retry_bug_status_sync when requested. comment_bug_pr uses the local ClickUp connection for the verified PR link and validation summary; uncertain writes are not blindly repeated.

Only the user's Mark finished action confirms tested acceptance and authorizes completion. mark_bug_finished verifies a merged PR into the configured target or an explicitly authorized direct commit contained in that target, posts one acceptance comment, completes ClickUp and deletes only the exact recorded branch at its verified commit. Preserve dirty or changed worktrees and branches. Never merge a PR automatically or change assignees.

Release assignment requires explicit confirmation the old coding task was stopped, its current launch ID and updated_at. It only releases the duplicate-start lock. Old progress must not relock a released run. Finish or stop and release outstanding assignments before changing project setup. Existing records are retained locally when switching projects; credentials and setup are never part of the distributable archive.

Filters, presets, comments and list workflow mappings are scoped to the configured workspace. Task locations are frozen per launch; never overwrite them with the currently selected filter. Preserve the last snapshot on failed reads. Use English for plugin UI, progress and generated comments unless the user requests another language.
