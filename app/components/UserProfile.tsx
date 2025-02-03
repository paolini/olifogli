import { useQuery, gql } from '@apollo/client';
import Loading from './Loading';
import Error from './Error';

const ME = gql`
  query Me {
    me {
      email
      }
  }`

const UserProfile = () => {
  const { data, loading, error } = useQuery(ME);
  const me = data?.me;
  if (loading) return <Loading />
  if (error) return <Error error={error} />

  return <div>
    {me 
      ? me.email 
      : <a href="/login">login</a>
    }
  </div>
};

export default UserProfile;
