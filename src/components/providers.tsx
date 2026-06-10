"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getStoredContext, setStoredContext } from "@/lib/api-client";
import { KubeContext } from "@/lib/hooks";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  // Read from localStorage after mount to avoid SSR hydration mismatch.
  const [context, setContextState] = useState<string | null>(null);
  useEffect(() => {
    setContextState(getStoredContext());
  }, []);

  const setContext = useCallback(
    (c: string | null) => {
      setStoredContext(c);
      setContextState(c);
      queryClient.clear();
    },
    [queryClient],
  );

  const kubeContextValue = useMemo(() => ({ context, setContext }), [context, setContext]);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        <KubeContext.Provider value={kubeContextValue}>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </KubeContext.Provider>
      </QueryClientProvider>
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  );
}
