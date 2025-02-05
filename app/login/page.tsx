//import Error from '../components/Error';
import OlimanagerLoginButton from '../components/OlimanagerLoginButton';

export default function LoginPage() {
  const OLIMANAGER_URL = process.env.OLIMANAGER_URL;

  return <>
    {OLIMANAGER_URL && <OlimanagerLoginButton url={OLIMANAGER_URL} />}
    {/*
    !OLIMANAGER_URL && <Error error="Nessun metodo di login disponibile" />*/}
  </>
}
