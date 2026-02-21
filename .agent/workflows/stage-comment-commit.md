---
description: Prepare granular conventional commits from all pending changes and push them to the repository. Produces one commit per logical change so Release Please generates detailed changelogs.
---

# Stage, Comment & Commit (Granular)

This workflow produces **multiple focused conventional commits** from the current working tree so that Release Please generates a meaningful changelog with one bullet per feature/fix.

// turbo-all

## Prerequisites

Before starting, verify we are on the correct branch:

```sh
git branch --show-current
```

## Step 1 — Survey Pending Changes

Run a **full diff summary** to understand what has changed:

```sh
git status --short
```

Then generate a diff stat to see which files and areas were touched:

```sh
git diff --stat HEAD
```

If there are untracked files, list them too:

```sh
git ls-files --others --exclude-standard
```

## Step 2 — Analyze and Group Changes

Carefully review the diff output and **mentally group changes into logical units**. Each group should map to exactly **one conventional commit**.

### Grouping Rules

1. **One commit per feature, fix, or refactor.** If the session added tags, audit logging, AND AI memory — that's 3 separate `feat:` commits, not 1.
2. **Scope by module when possible.** Use the conventional commit scope to indicate the area:
   - `feat(bot):` — bot-side logic (commands, services, modules)
   - `feat(web):` — dashboard/web UI changes
   - `feat(api):` — server API routes
   - `fix(bot):`, `fix(web):`, etc. — same idea for fixes
   - `chore:`, `ci:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:` — as appropriate
3. **Infrastructure/config changes** (Dockerfiles, CI, deps) get their own commit unless they are directly tied to a feature (e.g., adding a new dependency for a feature goes with that feature's commit).
4. **Styling/UI-only changes** that are cosmetic and not part of a feature should use `style:` type.
5. **Keep each commit self-contained.** Avoid commits that would break the build if checked out independently. If two groups are tightly coupled, combine them into one commit.

### Subject Line Quality

The commit **subject line** is what appears in the changelog. Make it:

- **Descriptive and specific** — bad: `add stuff`, good: `add voice channel recording module with multi-track playback`
- **Action-oriented** — start with a verb: add, implement, fix, refactor, update, remove
- **Concise but complete** — aim for 50-72 characters, but clarity trumps brevity
- **No period at the end**

### Body (Optional but Encouraged)

The commit **body** provides context for `git log` readers. Use it for:

- Bullet-point breakdown of what's included
- Rationale for non-obvious decisions
- References to issues or PRs

The body is **not** shown in the Release Please changelog — only the subject line is.

## Step 3 — Present the Commit Plan

Before staging anything, present the full commit plan to the user as a numbered list:

```
Commit Plan:
1. feat(bot): add tags system with slash command and CRUD API
   Files: bot/src/modules/tags/*, web/server/api/tags/*, ...
2. feat(bot): add audit logging for message and moderation events
   Files: bot/src/modules/audit/*, ...
3. feat(bot): add per-channel AI context memory with TTL
   Files: bot/src/modules/ai/*, ...
4. feat(web): add tags management dashboard page
   Files: web/pages/server/[id]/tags.vue, ...
5. chore: install ffmpeg in web Dockerfile for audio validation
   Files: web/Dockerfile
```

**Wait for user confirmation or adjustments before proceeding.**

## Step 4 — Stage and Commit Each Group

For each group in the approved plan, stage only the relevant files and commit:

```sh
# Stage specific files for this commit group
git add <file1> <file2> <dir/>

# Commit with conventional message
git commit -m "feat(bot): add tags system with slash command and CRUD API" -m "- Add tags collection schema with guild-scoped unique name index
- Implement /tag command with embed and text support
- Add CRUD API routes (/api/tags) with Appwrite admin proxy"
```

### Staging Tips

- Use `git add <specific-files>` — never `git add .` or `git add -A` during granular commits.
- Use `git add -p <file>` if a single file contains changes belonging to different groups (interactive hunk staging).
- After each commit, verify nothing was missed:
  ```sh
  git status --short
  ```

### Ordering

Commit in dependency order when possible:

1. Infrastructure/config changes first (new deps, Docker changes)
2. Backend/bot logic next
3. API routes
4. Frontend/web UI last
5. Documentation/chore commits at the end

## Step 5 — Verify Commit History

After all commits are made, display the new commits:

```sh
git log --oneline -<N>
```

Where `<N>` is the number of commits just created. Confirm with the user that the log looks correct.

## Step 6 — Push

Push all commits to the remote:

```sh
git push origin <current-branch>
```

## Handling Edge Cases

### Only 1 logical change

If all changes genuinely belong to a single feature/fix, make a single commit — don't artificially split. But make the subject line specific.

### Mixed staged/unstaged

If some files are already staged, check `git diff --cached --stat` first and account for those in the grouping.

### Merge conflicts after push

If push fails due to upstream changes, pull with rebase:

```sh
git pull --rebase origin <branch>
```

Then resolve conflicts and push again.

### Conventional Commit Types Reference

| Type       | Changelog Section | Hidden? |
| ---------- | ----------------- | ------- |
| `feat`     | ✨ Features       | No      |
| `fix`      | 🐛 Bug Fixes      | No      |
| `perf`     | ⚡ Performance    | No      |
| `refactor` | ♻️ Refactors      | No      |
| `docs`     | 📖 Documentation  | No      |
| `chore`    | 🧹 Chores         | Yes     |
| `ci`       | 🔧 CI             | Yes     |
| `style`    | 💅 Styles         | Yes     |
| `test`     | 🧪 Tests          | Yes     |

> **Important:** Types marked "Hidden" will NOT appear in the Release Please changelog. Use `feat` or `fix` for changes you want users to see.
