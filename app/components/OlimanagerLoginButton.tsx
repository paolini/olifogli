'use client'
export default function OlimanagerLoginButton({url}:{url: string}) {
  const callbackUrl = encodeURIComponent(`${window.location.origin}/api/auth/callback`);
  const loginUrl = `${url}?url=${callbackUrl}`;
  return (
    <a href={loginUrl} className="button">
      Accedi tramite olimanager
    </a>
  );
}