import { Logger, type Provider } from "@nestjs/common";

import { Collector } from "@boundaryml/baml";

import { b } from "../../baml_client";

import {
  TAILOR_REPHRASER,
  type RephraseInput,
  type TailorRephraserPort,
} from "./cv-tailor.rephraser.port";

// BAML-backed rephrase (DeepSeekClient). Never trusted alone — CvTailorService
// re-checks every output with the deterministic subset guard.
class BamlTailorRephraser implements TailorRephraserPort {
  async rephrase(input: RephraseInput): Promise<string> {
    const collector = new Collector("cv-tailor-rephrase");
    const result = await b.TailorBullet(
      input.sourceText,
      input.allowed.tech.join(", "),
      input.emphasis.join(", "),
      { collector },
    );
    const text = result.text?.trim();
    return text && text.length > 0 ? text : input.sourceText;
  }
}

// LLM rephrase is OFF unless CV_TAILOR_LLM=1 — no surprise spend on the user's
// DeepSeek key. When off, the token resolves to null and the tailor service
// keeps every bullet verbatim (SELECT/REORDER only, zero hallucination risk).
export const tailorRephraserProvider: Provider = {
  provide: TAILOR_REPHRASER,
  useFactory: (): TailorRephraserPort | null => {
    if (process.env.CV_TAILOR_LLM !== "1") return null;
    new Logger("CvTailor").log(
      "LLM rephrase ENABLED (CV_TAILOR_LLM=1) — TailorBullet will call DeepSeek",
    );
    return new BamlTailorRephraser();
  },
};
