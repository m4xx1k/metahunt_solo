import type { Metadata } from "next";

import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";

import { CoverageForm } from "./_components/CoverageForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coverage" };

export default function CoveragePage() {
  return (
    <>
      <PageHeader
        title="Coverage"
        hint="paste vacancy URLs — see which ones we have, and why the rest are missing"
      />
      <PageBody>
        <CoverageForm />
      </PageBody>
    </>
  );
}
