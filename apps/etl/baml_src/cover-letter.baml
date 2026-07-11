// Grounded cover letter (ADR-0011 §6): assembled from the candidate's approved
// achievements + the vacancy, never free-invented. A ledger check over the output
// (subset-guard) rejects any off-ledger tech/number afterward.

class CoverLetter {
  text string @description(#"
    3 short paragraphs, first person. Confident and specific. Every concrete claim must map to a
    provided achievement. No 'Dear Hiring Manager' boilerplate padding.
  "#)
}

function DraftCoverLetter(
  candidateName: string,
  role: string,
  company: string,
  achievements: string,
) -> CoverLetter {
  client DeepSeekClient
  prompt #"
    Write a short, sharp cover letter for {{ candidateName }} applying to the {{ role }} role at
    {{ company }}.

    RULES:
    - Use ONLY the achievements listed below. Never invent a fact, number, employer, or technology.
    - Connective and motivational prose is fine, but every concrete claim must trace to a listed
      achievement.
    - 3 paragraphs max. Specific over generic. No filler openings.

    ACHIEVEMENTS (the only facts you may cite):
    {{ achievements }}

    {{ ctx.output_format }}
  "#
}
