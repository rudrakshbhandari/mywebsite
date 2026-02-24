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

## After Completing a Task

1. **Commit** all changes with a conventional commit message.
2. **Push** the branch to the remote repository.
3. **Create a Pull Request** (PR) targeting `main` with a clear title and description of the changes.

## Summary

1. Create branch → 2. Make changes → 3. Commit (conventional) → 4. Push branch → 5. Open PR
