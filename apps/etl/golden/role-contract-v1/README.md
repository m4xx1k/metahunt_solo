# P1 role-contract working set

This is a 50-row, read-only production sample for the role/seniority contract
in `md/todo/dedup/p1-role-contract-review.md`. It deliberately uses the same
MET-24 corpus format rather than rewritten or synthetic vacancy text.

- `corpus.enc.json` is the obfuscated prompt input. Do not replace it casually.
- `manifest.json` records the selected real postings and coverage.
- `snapshot.json` pins the corpus, local candidate prompt, verified taxonomy and
  aliases used for this review cycle.
- `runs/prod.json` is the pre-existing production extraction captured alongside
  the sample. It is a triage baseline, not a provenance-comparable model run.

The sample has seven explicit, reproducible boundary cases in addition to the
diverse deterministic selection: CTO, Head of Engineering, a discipline-specific
Lead/Solution Architect, Android Team Lead, Senior Android, Middle iOS, and a
non-technical Recruitment Team Lead. Their immutable record is their IDs in the
manifest, not this prose.

## Review status

No P1 labels have been approved yet. The older MET-24 labels must not be copied
as role-contract truth because they use the old taxonomy. Human review will set
only `isTech`, `role`, and `seniority` from the original local text under the P1
contract; no provider call and no production write is allowed at this stage.

To open the local, plaintext review packets when the P1 labelling format is
ready, regenerate them rather than committing them:

```bash
GOLDEN_DIR=apps/etl/golden/role-contract-v1 pnpm golden batch
```

`batches/` is ignored intentionally because it contains decoded source text.
