"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/api/auth/callback`);
    const loginUrl = `https://olimpiadi-scientifiche.it/sso?url=${callbackUrl}`;

    window.location.href = loginUrl;
  }, []);

  return <p>Reindirizzamento in corso...</p>;
}
