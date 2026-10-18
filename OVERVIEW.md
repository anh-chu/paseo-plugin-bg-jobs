Background jobs shows the shell commands a Claude Code agent started in the background, and lets you follow and stop them.

When an agent runs a Bash command with `run_in_background`, the command returns at once and the timeline only shows "Ran". This plugin adds a pill to the composer, for example "2 bg jobs", while that agent has running jobs. The pill opens a panel beside the agent with one card per job:

- the command, its task ID, and how long it has run
- its status: running, stopping, completed, failed, stopped, or ended
- the last 16 KB of its output, refreshed every 2 seconds
- a Stop button for running jobs

Stop sends the agent a short prompt asking it to call TaskStop for that task. If the agent is busy, the prompt steers the current turn instead of interrupting it. The plugin never kills processes itself.

How it works: the daemon reads the agent's timeline when a turn ends and when the panel is open. It finds the background launch message, the task notification Claude Code sends when a job finishes, and TaskStop calls. Output comes from the file Claude Code names in the launch message, read on the daemon host.

Limits: works with the Claude Code provider only. Only the newest 2000 timeline entries are scanned. A job is marked ended when its agent's runtime closes, because Claude Code stops its background shells with it.
