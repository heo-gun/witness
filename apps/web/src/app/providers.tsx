"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ko } from "@/lib/i18n/ko";

export function Providers({ children }: { children: ReactNode }) {
  // 리렌더링마다 새 캐시가 생기지 않도록 컴포넌트 수명 동안 하나만 만든다
  const [queryClient] = useState(() => new QueryClient());
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
