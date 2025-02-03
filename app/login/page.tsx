import Error from '../components/Error';

export default function LoginPage() {
  const methods = []

  const OLIMANAGER_URL = process.env.OLIMANAGER_URL;

  if (OLIMANAGER_URL) {
    methods.push(<OlimanagerLoginButton key="olimanager" url={OLIMANAGER_URL} />);
  }

  if (methods.length === 0) {
    return <Error error="Nessun metodo di login disponibile" />;
  }

  return methods;
}

function OlimanagerLoginButton({url}:{url: string}) {
  const callbackUrl = encodeURIComponent(`${window.location.origin}/api/auth/callback`);
  const loginUrl = `${url}?url=${callbackUrl}`;
  return (
    <a href="/login">
      Accedi tramite olimanager
    </a>
  );
}