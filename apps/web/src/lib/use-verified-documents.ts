"use client";

import { useQuery } from "@tanstack/react-query";
import { verifyByHash } from "@/api/documents";
import { verifyPublicDocuments } from "./crypto/verify";

export function useVerifiedDocuments(hash?: string) {
  return useQuery({
    queryKey: ["documents", "verify", hash] as const,
    enabled: !!hash,
    queryFn: async ({ queryKey: [, , fileHash], signal }) => {
      if (!fileHash) throw new Error("Missing file hash");
      const candidates = await verifyByHash(fileHash, signal);
      return verifyPublicDocuments(fileHash, candidates, signal);
    },
    gcTime: 0,
    networkMode: "always",
    retry: 1,
  });
}
