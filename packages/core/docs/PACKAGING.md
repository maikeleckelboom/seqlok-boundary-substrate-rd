# Packaging Notes

- Export the full public surface, including diagnostics (`snapshotWithStatus`).
- Keep internal helpers private. Do not expose tuning knobs.
- ESM‑only; types emitted with exact public signatures shown in `PUBLIC_API.md`.
