'use client'

import { useEffect, useState } from 'react';

export default function OlimanagerLoginButton({url}:{url: string}) {
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    const encodedCallbackUrl = encodeURIComponent(`${window.location.origin}/api/auth/callback`);
    setCallbackUrl(encodedCallbackUrl);
  }, []);

  if (!callbackUrl) {
    return null; // or a loading spinner while the client-side code runs
  }

  const loginUrl = `${url}?url=${callbackUrl}`;

  return (
    <a href={loginUrl} className="button">
      Accedi tramite olimanager
    </a>
  );
}
