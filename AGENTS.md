# Agent Instructions

When working on this codebase, follow these workflow rules:

## Content Modification Guidelines (index.html)

**This is a public-facing portfolio.** Every word and piece of content is carefully chosen. Agents must:

- **Make only the specific changes requested** — Do not refactor, rephrase, or "improve" content unless explicitly asked.
- **Never remove content liberally** — Treat deletions as high-risk. Only remove content when the human has clearly specified what to remove and why.
- **When in doubt, ask** — If the requested change is ambiguous, could affect multiple sections, or might alter the intended meaning, ask for clarification before editing.
- **Avoid scope creep** — Do not add, remove, or rewrite copy beyond the exact scope of the human's request.
- **Preserve voice and tone** — Do not substitute synonyms or restructure sentences unless the human explicitly requests it.

## Branch Strategy

- **Always create a feature branch** before making changes. Do not work directly on `main`.
- **Changes get their own branch** — When modifying **any file**, create a **new branch from `main`** that matches the change (e.g., `docs/agents-content-guidelines`, `feat/dark-mode`). Do **not** commit to whatever feature branch the user is currently on. Push the new branch and **create a PR** — do not assume "just push" means push to the current branch.
- **Each distinct feature gets its own branch** — If an open PR already exists for a feature (e.g., `feat/sapphix-portfolio-project`), do NOT add new unrelated features to that same branch. Create a **separate branch from `main`** for each new feature, even if the user is asking for something "also" or "too". For example:
  - Adding Project A → branch: `feat/project-a`
  - User later asks "also add Project B" → branch: `feat/project-b` (separate, not added to `feat/project-a`)
- **Name branches appropriately** based on the task:
  - `feat/short-description` — new features (e.g., `feat/dark-mode-toggle`)
  - `fix/short-description` — bug fixes (e.g., `fix/navbar-mobile-menu`)
  - `style/short-description` — styling/UI changes (e.g., `style/hero-spacing`)
  - `refactor/short-description` — code refactoring (e.g., `refactor/css-variables`)
  - `docs/short-description` — documentation (e.g., `docs/readme-update`)
  - `chore/short-description` — maintenance (e.g., `chore/deps-update`)

## Commits

- **Use conventional commit format** for all commits:

  ```
  <type>[optional scope]: <description>

  [optional body]
  ```

- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- **Examples:**
  - `feat(hero): add terminal-style intro animation`
  - `fix(contact): resolve form validation issue`
  - `style(about): increase spacing before experience section`

## Implementation Rule (Critical)

**When asked to fix, change, or implement something, you MUST use the tools to actually make the change.**

- **Do NOT just explain the solution** — actually implement it using `StrReplace`, `Write`, etc.
- **Do NOT ask "should I make this change?"** — if the user is pointing out a problem, fix it
- **The full workflow is automatic** — branch → edit → commit → push → PR happens without asking for confirmation
- **Only explain what you did after it's done**, not as a substitute for doing it

If you catch yourself writing a code block or explaining "here's what you should change" — STOP. You should have already made the change via the tools.

## Image Cache Busting

**When adding or replacing an image** (logo, project thumbnail, photo, etc.):

- **Always add a cache-busting query param** — Images use long immutable cache in production. Append `?v=N` to the `src` (e.g., `img/nomnom.png?v=2`) so CDN/browsers fetch the new file instead of serving a cached old version.
- **Bump the version** — When replacing an existing image at the same path, increment the `v` value (e.g., from `?v=2` to `?v=3`). For new images, start with `?v=1`.
- **Do this automatically** — Apply the version param as part of any image update without being asked.

## Proactive Automation

**Run scripts yourself when possible.** If the codebase contains scripts/tools that can diagnose or fix an issue:

- **Don't wait for permission** — If a diagnostic script exists (e.g., `diagnose-*.mjs`, `test-*.mjs`), run it immediately to gather information
- **Run fix scripts** — If a script can resolve the issue (e.g., `get-oura-token.mjs` for OAuth issues), execute it rather than providing manual instructions
- **Use available automation** — Prefer automated solutions over manual steps whenever tools are available in `scripts/` or elsewhere
- **Handle interactive prompts** — If a script is interactive, create a non-interactive wrapper or pipe inputs when possible, rather than asking the user to run it themselves

## Oura Guardrails

If you touch the Oura health pipeline, read `docs/OURA_AUTOMATION.md` first.

- **Local and CI auth are intentionally different** — local runs may recover through browser OAuth and refresh `.oura_token`; CI must still fail loudly on auth problems.
- **Do not hardcode a single localhost callback port** for Oura OAuth recovery.
- **Do not commit auth artifacts** such as `.oura_token`, `.env`, `.oura_rotated_token`, or `.oura_no_change`.
- **Do not ship timestamp-only Oura updates** — if `oura_public.json` changed only in `lastUpdatedIso`, treat it as a no-op.
- **Prefer fixing `scripts/fetch_oura_and_write_json.mjs`** rather than adding new parallel Oura auth paths.

## After Completing a Task

1. **Commit** all changes with a conventional commit message.
2. **Push** the branch to the remote repository.
3. **Create a Pull Request** (PR) targeting `main` with a clear title and description of the changes.
4. **Always share the PR link** — Include the full URL in your response immediately after creating a PR. Do not skip this step.

## Summary

1. Create branch → 2. Make changes → 3. Commit (conventional) → 4. Push branch → 5. Open PR → 6. **Share PR link** (always include URL in response)

---

## Autonomous Execution (Critical)

- The agent must do everything it can itself before asking the user.

Only ask the user if:

1. Information is truly unavailable (passwords, API keys, 2FA)
2. A physical/manual action is required
3. The system blocks execution with no workaround

The agent must NOT:

- Ask the user to run commands, edit code, install dependencies, or debug
- Suggest steps it can perform itself
- Stop early or hand off work

Expected behavior:

- Try all programmatic options (code, commands, APIs, file edits)
- Make reasonable assumptions and proceed
- Attempt multiple approaches before giving up

Escalation rule:

Only ask after failing independently, and include:

- what was tried
- why it failed
- the minimal input needed

Bias:

When unsure -> act, don't ask
