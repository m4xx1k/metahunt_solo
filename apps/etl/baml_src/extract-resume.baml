// Full structured-resume extraction for CV tailoring (ADR-0011 §3). Lifts an
// uploaded CV's text into the founder's resume.yaml shape. Extraction copies
// facts as written — the tailoring guard (subset-guard.ts) later proves no
// tailored line adds anything beyond what this extract already stated, so the
// grounding rule here is: never invent, leave empty when absent.

class ResumeContactInfo {
  location string?
  email string?
  phone string?
  linkedin string?
  github string?
  telegram string?
}

class ResumeSkillGroup {
  group string @description(#"area label, e.g. Backend / Frontend / Databases / Infra / AI"#)
  items string[] @description(#"individual skills, split out (not a joined string); only skills the CV states"#)
}

class ResumeExperienceItem {
  role string
  org string @description(#"employer name, exactly as written"#)
  dates string @description(#"the date range as written, e.g. 'Sep 2025 – Present'"#)
  context string @description(#"one short line of company/stack context if present, else empty"#)
  bullets string[] @description(#"
    achievement bullets, each faithful to the CV. Copy the facts exactly —
    every technology, number, metric, employer, and date must appear in the CV.
    You may tighten wording but never add a fact. One idea per bullet.
  "#)
}

class ResumeProjectItem {
  name string
  meta string @description(#"e.g. 'solo · side project', else empty"#)
  link string
  context string
  bullets string[] @description(#"same faithfulness rule as experience bullets"#)
}

class ResumeEducationItem {
  degree string
  school string
  dates string
}

class StructuredResumeExtract {
  name string
  title string @description(#"headline/title, as written; empty if none"#)
  contacts ResumeContactInfo
  summary string @description(#"the profile/summary paragraph, faithful to the CV; empty if none"#)
  skills ResumeSkillGroup[]
  experience ResumeExperienceItem[]
  projects ResumeProjectItem[]
  education ResumeEducationItem[]
}

function ExtractResume(text: string) -> StructuredResumeExtract {
  client DeepSeekClient
  prompt #"
    Extract the resume below into structured form, EXACTLY as written.

    HARD RULES:
    - Never invent an employer, date, number, metric, technology, or achievement.
    - If a section or field is absent, leave it empty — do not fill it in.
    - Bullets must be faithful to the CV text; you may condense wording but every
      fact in a bullet must be present in the source.
    - Split skill lists into individual items; keep only skills the CV states.

    RESUME:
    {{ text }}

    {{ ctx.output_format }}
  "#
}
