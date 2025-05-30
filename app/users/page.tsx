"use client"
import { gql, useQuery } from '@apollo/client'
import ApolloProviderClient from '@/app/ApolloProviderClient'
import Link from "next/link"

import { User } from "@/app/lib/models"
import NavBar from "../components/NavBar"
import Loading from "../components/Loading"
import Error from "../components/Error"

const USERS_QUERY = gql`
    query GetUsers {
        users {
            _id
            email
            is_admin
        }
    }
`

export default function Page() {
      return <ApolloProviderClient>
        <NavBar />
        <Users />
      </ApolloProviderClient>
}

function Users() {
    const { data, loading, error } = useQuery<{ users: User[] }>(USERS_QUERY)

    if (loading) return <Loading />
    if (error) return <Error error={error} />

    const users = data?.users || []

    return <>
        <h1>utenti</h1>
        <table>
            <thead>
                <tr>
                    <th>email</th>
                    <th>admin</th>
                </tr>
            </thead>
            <tbody>
                {users.map(user => <tr key={user._id.toString()}>
                    <td>{user.email}</td>
                    <td>{user?.is_admin ? '✓' : ''}</td>
                </tr>)}
            </tbody>
        </table>
    </>
}
