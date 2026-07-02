"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cvApi, type CvIngestResult, type SampleCandidate } from "@/lib/api/cv";
import { useResults } from "@/features/vacancy-filters/use-results";
import { MATCH_PAGE_SIZE } from "@/features/vacancy-filters/warm-query";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";

// All reverse-ATS page state in one place, so the component is just markup.
// Samples and uploads are both candidate rows → one fetch path (useResults warm,
// keyed on candidateId). `active` tracks which candidate is ranked; only an
// uploaded CV (`upload`) gets the subscribe button + recommendations.
type Active =
  | { kind: "sample"; candidateId: string; label: string }
  | { kind: "upload"; candidateId: string; info: CvIngestResult };

export function useReverseAts(samples: SampleCandidate[]) {
  const api = useUrlFilters();
  const [active, setActive] = useState<Active | null>(() =>
    samples[0]
      ? { kind: "sample", candidateId: samples[0].candidateId, label: samples[0].label }
      : null,
  );
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // A filter change can shrink the result set below the current page — reset to
  // 1 in the same render (React's "adjust state on prop change" pattern), so the
  // results query never fires for an out-of-range page. `api.filters` is stable
  // per URL, so this only trips on a real filter change.
  const [prevFilters, setPrevFilters] = useState(api.filters);
  if (prevFilters !== api.filters) {
    setPrevFilters(api.filters);
    setPage(1);
  }

  const { data, isFetching, isError, error } = useResults({
    lens: "warm",
    candidateId: active?.candidateId ?? "",
    filters: api.filters,
    page,
    enabled: active != null,
  });

  // Recommendations depend only on the candidate, not the filters — and only an
  // uploaded CV shows them (a demo sample is just a ranking preview).
  const recCandidateId = active?.kind === "upload" ? active.candidateId : null;
  const { data: rec } = useQuery({
    queryKey: ["recs", recCandidateId],
    queryFn: () => cvApi.recommendations(recCandidateId as string),
    enabled: recCandidateId != null,
    staleTime: 30_000,
  });

  const selectSample = useCallback((s: SampleCandidate) => {
    setUploadError(null);
    setPage(1);
    setActive({ kind: "sample", candidateId: s.candidateId, label: s.label });
  }, []);

  const onFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const info = await cvApi.uploadFile(file);
      setPage(1);
      setActive({ kind: "upload", candidateId: info.candidateId, info });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "request failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const goToOffset = useCallback((offset: number) => {
    setPage(Math.floor(offset / MATCH_PAGE_SIZE) + 1);
  }, []);

  const isUpload = active?.kind === "upload";
  return {
    api,
    active,
    isUpload,
    candidateId: active?.candidateId ?? null,
    data,
    rec,
    page,
    pageSize: MATCH_PAGE_SIZE,
    busy: isFetching || uploading,
    uploading,
    errorMsg:
      uploadError ??
      (isError ? (error instanceof Error ? error.message : "request failed") : null),
    profileTitle:
      active?.kind === "upload"
        ? "твоє CV"
        : active
          ? `профіль · ${active.label}`
          : "",
    profileRole: active?.kind === "upload" ? active.info.role : null,
    profileSeniority: active?.kind === "upload" ? active.info.seniority : null,
    fileRef,
    selectSample,
    onFile,
    goToOffset,
  };
}
