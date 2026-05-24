# Prompt Changelog

All changes to production prompt files are documented here with
root cause, fix applied, and test results before version bump.

---

## v1.2.4 - 2026-05-23

**Change:** Strengthened output constraints and model selection.

**Root cause:** Extended thinking models externalize reasoning as prose
before the JSON object, violating the OUTPUT constraint. This behavior
cannot be suppressed by system prompt instructions alone on models with
built-in chain-of-thought.

**Fix:** Switched target model from extended thinking variant to
claude-sonnet-4-5-20250929, which follows structured output instructions
reliably. Added explicit guidance directing the model to place all
uncertainty reasoning inside the "reason" field rather than before the
JSON object.

**Root cause category:** MODEL_BEHAVIOR

**Test results:**
- Case 1 (clear note): confidence 0.98, status approved - PASS
- Case 2 (ambiguous date): confidence 0.73, status requires_review - PASS
- Case 3 (vague note): confidence 0.00, status requires_review - PASS
- All outputs begin with { and contain no prose preamble - PASS

**Validated on:** claude-sonnet-4-5-20250929
**Validated via:** Anthropic Console Workbench

---

## v1.2.3 - 2026-05-22

**Change:** Initial prompt version. ROLE, TASK, OUTPUT, UNCERTAINTY,
and PROHIBITED sections defined.

**Known issue:** OUTPUT constraint insufficient for extended thinking
models. Prose reasoning appears before JSON object on ambiguous inputs.

**Root cause category:** MODEL_BEHAVIOR

**Status:** Superseded by v1.2.4.
