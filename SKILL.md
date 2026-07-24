# Clean Code Principles Skill

## Purpose

This skill ensures all generated code is clean, maintainable, consistent, and easy to understand.

Always prioritize simplicity, reuse, and consistency over unnecessary abstractions or architectural complexity.

Primary goals:

- Produce clean and readable code.
- Minimize unnecessary complexity.
- Reuse existing implementations whenever possible.
- Avoid duplicate logic and duplicate responsibilities.
- Preserve project consistency.
- Implement only what is required.

---

# Priority Order

When solving any task, always follow this order:

1. Understand the existing project.
2. Reuse existing code.
3. Make the smallest possible change.
4. Keep the implementation simple.
5. Avoid duplication.
6. Only implement current requirements.
7. Improve readability without changing behavior.

---

# Repository Awareness

Before writing any code:

- Read the relevant files first.
- Understand the existing architecture.
- Follow existing coding conventions.
- Respect project structure.
- Identify reusable modules.
- Understand how the feature currently works.

Never start generating code before understanding the surrounding codebase.

---

# Reuse Before Create

Always search the repository before creating anything new.

Before creating:

- file
- folder
- module
- class
- struct
- interface
- service
- repository
- helper
- utility
- component
- hook
- middleware
- configuration
- constant
- function

verify whether an equivalent already exists.

If an implementation already exists:

- Reuse it.
- Extend it if appropriate.
- Refactor it only when necessary.

Do not create duplicate responsibilities.

---

# No Duplicate Implementation

Every responsibility should have a single implementation.

Avoid creating:

- duplicate validation
- duplicate calculations
- duplicate API clients
- duplicate database logic
- duplicate configuration
- duplicate constants
- duplicate utilities
- duplicate business rules

If similar logic already exists, consolidate it instead of copying it.

---

# Minimal Change Principle

Modify as little as possible.

Do not:

- rewrite entire files
- rename unrelated code
- reorganize folders
- move files
- reformat the whole project
- refactor unrelated modules

unless explicitly requested.

Small focused changes are preferred.

---

# YAGNI (You Aren't Gonna Need It)

Only implement functionality that is required today.

Do not create:

- future-proof abstractions
- speculative features
- unused configuration
- generic systems for one use case
- extension points that are not needed

Solve today's problem.

---

# KISS (Keep It Simple)

Prefer the simplest solution that correctly solves the problem.

Avoid:

- unnecessary design patterns
- excessive abstraction
- deeply nested logic
- clever implementations that reduce readability

Readable code is better than clever code.

---

# DRY (Don't Repeat Yourself)

Avoid duplicated logic.

If logic already exists:

- reuse it
- extract shared behavior when appropriate
- keep one source of truth

Do not copy and slightly modify existing implementations.

---

# Functions

Functions should:

- have one responsibility
- have descriptive names
- remain reasonably small
- be easy to read
- avoid unnecessary side effects

Each function should answer one question:

"What is this function responsible for?"

---

# Abstraction

Do not abstract prematurely.

Introduce abstractions only when they:

- reduce duplication
- improve readability
- simplify maintenance
- clearly separate responsibilities

Never create abstractions simply because they might be useful later.

---

# Project Structure

Follow the existing architecture.

Do not introduce a new project structure unless explicitly requested.

Keep related code together.

Only create new files or folders when they provide a clear organizational benefit.

---

# Naming

Use descriptive and consistent names.

Names should explain intent without requiring comments.

Avoid:

- vague names
- numbered versions
- temporary names
- abbreviations that reduce clarity

Follow the project's existing naming convention.

---

# Dependencies

Prefer existing project dependencies.

Before adding a new dependency:

- verify it is actually needed
- check whether the standard library is sufficient
- check whether the project already solves the problem

Avoid dependency bloat.

---

# Error Handling

Errors should provide useful context.

Do not silently ignore errors.

Return or propagate errors with enough information for debugging while preserving the original cause whenever possible.

---

# AI Coding Behavior

When modifying existing projects:

- Understand before changing.
- Reuse before creating.
- Extend before replacing.
- Preserve consistency.
- Avoid unnecessary rewrites.
- Never generate duplicate implementations.
- Never introduce a different architecture without permission.

---

# Before Finishing

Verify that:

- No duplicate code was introduced.
- No duplicate files were created.
- Existing implementations were reused.
- Only requested functionality was implemented.
- Project structure remains consistent.
- Naming follows project conventions.
- Dependencies remain minimal.
- Code is simpler than before.
- The implementation is easy to understand.
- The solution follows YAGNI, KISS, and DRY.

---

# Golden Rule

The best code is not the one with the most abstractions or the most files.

The best code is the smallest, clearest, and simplest implementation that solves the current problem while remaining consistent with the existing project.