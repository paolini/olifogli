import { useQuery, gql } from '@apollo/client';
import Loading from './Loading';
import Error from './Error';

const ME = gql`
  query Me {
    me {
      email
      }
  }`

export default function UserProfile() {
  const { data, loading, error } = useQuery(ME);
  const me = data?.me;
  if (loading) return <Loading />
  if (error) return <Error error={error} />

  if (me) return <LoggedInUserProfile me={me} />

  return <a href="/login">login</a>
}

function LoggedInUserProfile({me}:{me: {email: string}}) {
  return <div>
    <p>
      {me.email}
      <br/>
      <a href="/api/auth/logout">logout</a>
    </p>
  </div>
}