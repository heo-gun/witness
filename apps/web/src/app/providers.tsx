"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ko } from "@/lib/i18n/ko";
import { ApiError } from "@/api/client";
import { authKeys } from "@/api/auth";

export function Providers({ children }: { children: ReactNode }) {
  // 리렌더링마다 새 캐시가 생기지 않도록 컴포넌트 수명 동안 하나만 만든다
  const [queryClient] = useState(() => {
    function checkSession(error: Error) {
      if (!(error instanceof ApiError)) return;
      if (error.status === 412) {
        const hadSession = !!client.getQueryData(authKeys.me);
        if (hadSession) client.setQueryData(authKeys.me, null);
        void client.invalidateQueries({ queryKey: authKeys.me }, { cancelRefetch: hadSession });
      } else if (error.status === 401 && client.getQueryData(authKeys.me)) {
        void client.invalidateQueries({ queryKey: authKeys.me }, { cancelRefetch: false });
      }
    }
    const client = new QueryClient({
      defaultOptions: { mutations: { networkMode: "always" } },
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (query.queryKey[0] !== "auth") checkSession(error);
        },
      }),
      mutationCache: new MutationCache({ onError: checkSession }),
    });
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        richColors
        closeButton
        position="bottom-right"
        containerAriaLabel={ko.common.toastLabel}
        toastOptions={{ closeButtonAriaLabel: ko.common.closeToast }}
      />
    </QueryClientProvider>
  );
}
