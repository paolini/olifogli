import { gql, useQuery } from '@apollo/client'
import { useSession } from 'next-auth/react'

const GET_PROFILE = gql`
    query GetProfile {
        me {
            _id
            isAdmin
            email
            name
        }
    }
`;

export default function useProfile() {
    const { data: session } = useSession()
    const { data, loading, error } = useQuery(GET_PROFILE, {
        skip: !session?.user,
    })

    if (!session) return undefined
    if (!session?.user) return null
    if (loading) return undefined
    if (error) throw error
    if (!data?.me) return null
    
    return data.me
}