// Interview prep for a specific role: likely questions + honest, evidence-backed
// talking points drawn only from the candidate's real achievements.

class InterviewQuestion {
  question string
  angle string @description(#"why an interviewer asks this for this role / what they probe"#)
  evidence string @description(#"
    a concrete talking point drawn ONLY from the candidate's achievements; if the question targets
    a gap with no matching achievement, give honest advice on how to address it instead.
  "#)
}

function InterviewPrep(
  role: string,
  strengths: string,
  gaps: string,
  achievements: string,
) -> InterviewQuestion[] {
  client DeepSeekClient
  prompt #"
    Prep a candidate for an interview for the {{ role }} role. Produce exactly 5 likely, specific
    questions: 2 on their strengths, 2 probing their gaps, 1 behavioral.

    For each question give the angle and a concrete talking point drawn ONLY from the candidate's
    achievements below. Do not invent experience they don't have — for a gap with no matching
    achievement, advise how to address it honestly.

    STRENGTHS (skills they have that the role wants): {{ strengths }}
    GAPS (skills the role wants that they lack): {{ gaps }}
    ACHIEVEMENTS: {{ achievements }}

    {{ ctx.output_format }}
  "#
}
