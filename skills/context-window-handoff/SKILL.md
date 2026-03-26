---
name: context-window-handoff
description: Create or update a compact Markdown handoff for another Codex session to resume quickly. Use when context window is getting tight, the session must pause, the user asks for a handoff or summary file, or active work needs to be compressed into a short resume note with current status, blockers, changed files, commands, and next steps.
---

# Context Window Handoff

Produce a single Markdown handoff that lets the next agent resume in minutes instead of rereading the whole thread.

Prefer exact state over narrative. Keep the note short, factual, and action-oriented.

## Default Workflow

1. Write to `HANDOFF.md` at the workspace root unless the user requested a different path.
2. If the file does not exist or a fresh scaffold is faster, run `python3 scripts/create_handoff.py /path/to/HANDOFF.md`.
3. Fill the scaffold with verified facts from the current session.
4. Update the existing handoff instead of creating duplicates unless the user asks for timestamped notes.

## Compression Rules

- Aim for roughly 150-400 words unless the user asks for detail.
- Preserve only high-signal state:
  - current goal
  - what changed
  - current blocker or uncertainty
  - next concrete steps
  - files to open first
  - commands run and validation results
- Include exact file paths, command names, and failure messages when they matter.
- Mark guesses as assumptions.
- Omit backstory, repeated architecture explanations, raw logs, and anything already obvious from the repo tree.

## Required Sections

Keep these sections unless the user explicitly wants a different format:

- `Goal`
- `What Changed`
- `Current State`
- `Blockers`
- `Next Steps`
- `Files to Read`
- `Commands / Validation`

Use flat bullets inside sections. Keep each bullet standalone.

## Minimal Emergency Mode

If there is barely enough room left to finish:

1. Create or update the file immediately.
2. Fill only five bullets:
   - objective
   - last completed change
   - exact blocker
   - next command or file to open
   - anything risky to avoid overwriting
3. Stop once the next agent can safely continue.

## Quality Bar

- Prefer concrete state over polished prose.
- Mention uncommitted changes if you touched files.
- Include test or build status even when it failed.
- If no code changed, say what was investigated and what should happen next.

## Resources

- Use `scripts/create_handoff.py` to stamp out a fresh handoff file quickly.
- Use `assets/HANDOFF.template.md` as the canonical structure.
