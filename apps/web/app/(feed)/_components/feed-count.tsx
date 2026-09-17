"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type FeedCount = { total: number; pending: boolean };

const ValueCtx = createContext<FeedCount | null>(null);
const PublishCtx = createContext<(count: FeedCount) => void>(() => {});

// Seeded from the server so the hero renders the filtered total on first paint
// instead of snapping to it on hydration.
export function FeedCountProvider({
  initialTotal,
  children,
}: {
  initialTotal: number | null;
  children: ReactNode;
}) {
  const [count, publish] = useState<FeedCount | null>(
    initialTotal === null ? null : { total: initialTotal, pending: false },
  );
  return (
    <PublishCtx.Provider value={publish}>
      <ValueCtx.Provider value={count}>{children}</ValueCtx.Provider>
    </PublishCtx.Provider>
  );
}

export const useFeedCount = () => useContext(ValueCtx);
export const usePublishFeedCount = () => useContext(PublishCtx);
