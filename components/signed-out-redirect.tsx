"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SignedOutRedirect({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/?auth=sign-in&next=${encodeURIComponent(returnTo)}`);
  }, [returnTo, router]);

  return <div className="center-message" role="status">Returning you to Postcard…</div>;
}
