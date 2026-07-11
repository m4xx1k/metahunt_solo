// Bold, batched rewrite of the selected resume bullets for a target role
// (ADR-0011 §5.3). One call rewrites all bullets; the deterministic subset guard
// then verifies each and rejects any that added a fact — so this prompt can be
// aggressive without being able to lie. Runs on the cheap DeepSeekClient.

class TailorInputBullet {
  id string
  text string
}

class TailorOutputBullet {
  id string @description(#"copy the input id EXACTLY — one output per input, matched by id"#)
  text string @description(#"the rewritten bullet, one line"#)
}

function TailorResume(bullets: TailorInputBullet[], role: string, emphasis: string) -> TailorOutputBullet[] {
  client DeepSeekClient
  prompt #"
    You are a sharp senior tech recruiter rewriting a candidate's resume bullets to win one
    specific role. Rewrite EACH bullet to be impact-first and in the target role's language.

    BE BOLD: lead with the outcome, use strong precise verbs, foreground the EMPHASIS skills the
    bullet genuinely supports, cut filler and hedging.

    BUT you may use ONLY facts already present in each source bullet:
    - never add a technology, tool, employer, product, date, or number that isn't in that bullet;
    - never change a number (2,800 stays 2,800; ~40% stays ~40%; 80+ keeps its "+");
    - do not pull an EMPHASIS skill into a bullet that doesn't already contain it.
    A separate deterministic checker rejects any line that adds a fact, so inventing anything only
    gets your rewrite thrown away and the original kept. Play to win within the facts.

    Preserve each bullet's id EXACTLY and return exactly one rewrite per input bullet.

    TARGET ROLE: {{ role }}
    EMPHASIS SKILLS: {{ emphasis }}

    BULLETS:
    {{ bullets }}

    {{ ctx.output_format }}
  "#
}
