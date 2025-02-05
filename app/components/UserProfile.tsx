import { useQuery, gql } from '@apollo/client';
import Loading from './Loading';
import Error from './Error';
import { User } from '../graphql/types';

const ME = gql`
  query Me {
    me {
      uid
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

function LoggedInUserProfile({me}:{me: User}) {
  return <div>
    <p>
      {me.uid}
      <br/>
      <a href="/api/auth/logout">logout</a>
    </p>
  </div>
}