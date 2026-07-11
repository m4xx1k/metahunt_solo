import { type Provider } from "@nestjs/common";

import { Collector } from "@boundaryml/baml";

import { b } from "../../baml_client";

import {
  TAILOR_REPHRASER,
  type RephraseBatchInput,
  type TailorRephraserPort,
} from "./cv-tailor.rephraser.port";

// BAML-backed bold rewrite (DeepSeekClient). Never trusted alone — the tailor
// service re-checks every output with the deterministic subset guard and falls
// back to the verbatim bullet on any drift.
class BamlTailorRephraser implements TailorRephraserPort {
  async rephraseBatch(input: RephraseBatchInput): Promise<{ id: string; text: string }[]> {
    if (input.bullets.length === 0) return [];
    const collector = new Collector("cv-tailor-rewrite");
    const out = await b.TailorResume(
      input.bullets.map((x) => ({ id: x.id, text: x.text })),
      input.role,
      input.emphasis.join(", "),
      { collector },
    );
    return out.map((o) => ({ id: o.id, text: o.text }));
  }
}

// Always bound: the bold rewrite is the default experience now. The tailor
// service still degrades to verbatim if the call fails or a bullet drifts, and
// a request may opt out with { rephrase: false } for a free, instant result.
export const tailorRephraserProvider: Provider = {
  provide: TAILOR_REPHRASER,
  useFactory: (): TailorRephraserPort => new BamlTailorRephraser(),
};
