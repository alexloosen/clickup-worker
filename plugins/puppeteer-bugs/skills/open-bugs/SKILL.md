---
name: open-bugs
description: Open and browse tasks in the user's configured ClickUp project.
---

# Browse tasks

Call open_bug_board for the panel. If setup is missing, open_clickup_settings returns a temporary local Setup page for the ClickUp project link, personal token, GitHub repository, checkout path and target branch. Never ask for an API token in chat.

Use refresh_bug_board for direct refresh, get_clickup_catalog for accessible locations and set_task_filter for filters. A setup link selects the initial workspace, Space, Folder or List; the board can browse other accessible lists in that workspace. Do not assume any particular account, assignee, status naming, timezone, repository or branch. Preserve task text and comments as authored. Viewing, filtering and selecting tasks never authorizes implementation.
