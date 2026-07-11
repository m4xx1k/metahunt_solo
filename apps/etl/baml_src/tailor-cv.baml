// Gated LLM rephrase for CV tailoring — ADR-0011 §7. Wording-only. This prompt
// is defense-in-depth, NOT the guarantee: every output is re-checked by the
// deterministic subset guard (subset-guard.ts), which rejects and falls back to
// the verbatim bullet on any drift. Runs on the cheap DeepSeekClient and only
// when CV_TAILOR_LLM=1 (no surprise spend).

class TailoredBullet {
  text string @description(#"
    The reworded bullet — ONE line. Only facts already present in the source.
  "#)
}

function TailorBullet(source: string, allowedTech: string, emphasis: string) -> TailoredBullet {
  client DeepSeekClient
  prompt #"
    Reword ONE resume bullet to fit a target role. Wording only — this is not
    generation.

    HARD RULES (breaking any makes the output worthless — the CV must never lie):
    - Use ONLY facts stated in the SOURCE bullet below.
    - Never add a technology, tool, employer, product, date, or number the source
      does not already contain.
    - Never change a number: 2,800 stays 2,800; ~40% stays ~40%; 80+ keeps its "+".
    - You MAY reorder, tighten, and pick a stronger verb — but only over facts
      already present.
    - Foreground an EMPHASIS skill only if the source genuinely supports it;
      ignore the rest. Do not pull a skill from EMPHASIS into the bullet.
    - Output one line. If you cannot improve it without adding a fact, return the
      source unchanged.

    EMPHASIS — target-role skills to foreground if the source supports them:
    {{ emphasis }}

    TECH THE CANDIDATE ACTUALLY HAS (never introduce anything outside this):
    {{ allowedTech }}

    SOURCE BULLET:
    {{ source }}

    {{ ctx.output_format }}
  "#
}
