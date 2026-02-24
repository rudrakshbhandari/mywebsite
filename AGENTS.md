# Agent Instructions

When working on this codebase, follow these workflow rules:

## Branch Strategy

- **Always create a feature branch** before making changes. Do not work directly on `main`.
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
