import Error from '../components/Error';
import OlimanagerLoginButton from '../components/OlimanagerLoginButton';

export default function LoginPage() {
  const methods = []

  const OLIMANAGER_URL = process.env.OLIMANAGER_URL;

  if (OLIMANAGER_URL) {
    methods.push(<OlimanagerLoginButton key="olimanager" url={OLIMANAGER_URL} />);
  }

  if (methods.length === 0) {
    return <Error error={`Nessun metodo di login disponibile ${OLIMANAGER_URL}`} />;
  }

  return methods;
}
