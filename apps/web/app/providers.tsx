"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// One QueryClient per browser session (created in state so it survives re-renders
// but never leaks between requests on the server). staleTime keeps the
// server-seeded data from refetching the instant the page hydrates.
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000 } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
