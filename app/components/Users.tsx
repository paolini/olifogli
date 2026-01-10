"use client"
import { gql, useQuery, useMutation } from '@apollo/client'
import UsersSortIcon from './UsersSortIcon'
import FilterIcon from './FilterIcon'
import { useState } from 'react'

import { User } from "@/app/lib/models"
import Loading from "../components/Loading"
import Error from "../components/Error"
import useProfile from '../lib/useProfile'

const USERS_QUERY = gql`
    query GetUsers {
        users {
            _id
            email
            isAdmin
            isSupervisor
            name
        }
    }
`

const ME_QUERY = gql`
    query Me {
        me {
            _id
            email
            isAdmin
        }
    }
`

const UPDATE_USER_ROLE_MUTATION = gql`
    mutation UpdateUserRole($userId: ID!, $isAdmin: Boolean!, $isSupervisor: Boolean!) {
        updateUserRole(userId: $userId, isAdmin: $isAdmin, isSupervisor: $isSupervisor) {
            _id
            isAdmin
            isSupervisor
        }
    }
`

export default function Users() {
    const profile = useProfile()
    const { data: usersData, loading, error } = useQuery<{ users: User[] }>(USERS_QUERY)
    const { data: meData, loading: meLoading, error: meError } = useQuery(ME_QUERY)
    const [updateUserRole] = useMutation(UPDATE_USER_ROLE_MUTATION, {
        refetchQueries: [{ query: USERS_QUERY }],
    })

    // Sorting and filtering state
    const [sort, setSort] = useState<{ field: string, direction: number } | null>(null)
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
    const [filterMenuOpen, setFilterMenuOpen] = useState<string|null>(null)

    if (loading || meLoading) return <Loading />
    if (error || meError) return <Error error={error || meError} />

    let users = usersData?.users || []
    const currentUserId = meData?.me?._id?.toString() || null

    // Filtering
    Object.entries(columnFilters).forEach(([col, val]) => {
        if (!val) return
        users = users.filter(u => {
            let v = ''
            if (col === 'email') v = u.email ?? ''
            else if (col === 'name') v = u.name ?? ''
            else if (col === 'role') {
                if (u.isAdmin) v = 'admin'
                else if (u.isSupervisor) v = 'supervisor'
                else v = ''
            }
            return v.toString().toLowerCase().includes(val.toLowerCase())
        })
    })

    // Sorting
    if (sort) {
        users = [...users].sort((a, b) => {
            let av = '', bv = ''
            if (sort.field === 'email') {
                av = a.email ?? ''
                bv = b.email ?? ''
            } else if (sort.field === 'name') {
                av = a.name ?? ''
                bv = b.name ?? ''
            } else if (sort.field === 'role') {
                if (a.isAdmin) av = 'admin'
                else if (a.isSupervisor) av = 'supervisor'
                else av = ''
                if (b.isAdmin) bv = 'admin'
                else if (b.isSupervisor) bv = 'supervisor'
                else bv = ''
            }
            return av.localeCompare(bv, 'it', { sensitivity: 'base' }) * sort.direction
        })
    }

    function Th({ field, header }: { field: string, header: string }) {
        const isFiltered = !!columnFilters[field]
        return <th key={field} style={{ position: 'relative' }}>
            <span className="flex items-center justify-between gap-2">
                <span>{header.replace('_', ' ')}</span>
                <span className="flex items-center gap-1">
                    <span style={{ cursor: 'pointer' }} onClick={() => {
                        setSort(s => {
                            if (!s || s.field !== field) return { field: field, direction: 1 }
                            if (s.direction === 1) return { field: field, direction: -1 }
                            return null
                        })
                    }}>
                        <UsersSortIcon direction={sort?.field === field ? sort.direction : undefined} />
                    </span>
                    <span style={{ cursor: 'pointer' }} onClick={() => setFilterMenuOpen(filterMenuOpen === field ? null : field)}>
                        <FilterIcon active={isFiltered} />
                    </span>
                </span>
            </span>
            {filterMenuOpen === field && (
                <div>
                    <input
                        type="text"
                        value={columnFilters[field] || ''}
                        onChange={e => setColumnFilters(f => ({ ...f, [field]: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Escape') {
                                setColumnFilters(f => ({ ...f, [field]: '' }))
                                setFilterMenuOpen(null)
                            }
                        }}
                        placeholder={`Filtra ${header}`}
                        className="border rounded px-2 py-1 w-full"
                        autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                        <button className="text-xs px-2 py-1 border rounded" onClick={() => setColumnFilters(f => ({ ...f, [field]: '' }))}>Reset</button>
                        <button className="text-xs px-2 py-1 border rounded" onClick={() => setFilterMenuOpen(null)}>Chiudi</button>
                    </div>
                </div>
            )}
        </th>
    }

    return <>
        <h1>utenti</h1>
        <table>
            <thead>
                <tr>
                    <Th field="email" header="email" />
                    <Th field="name" header="nome" />
                    <Th field="role" header="ruolo" />
                </tr>
            </thead>
            <tbody>
                {users.map(user => {
                    let role = ''
                    if (user.isAdmin) role = 'admin'
                    else if (user.isSupervisor) role = 'supervisor'
                    else role = ''
                    return <tr key={user._id.toString()}>
                        <td>{user.email}</td>
                        <td>{user.name}</td>
                        <td>
                            {profile?.isAdmin  
                            ? <select
                                disabled={user._id.toString() === String(currentUserId)}
                                value={role}
                                onChange={e => {
                                    const value = e.target.value
                                    const isAdmin = value === 'admin'
                                    const isSupervisor = value === 'supervisor'
                                    updateUserRole({ variables: { userId: user._id, isAdmin, isSupervisor } })
                                }}
                            >
                                <option value=""></option>
                                <option value="admin">admin</option>
                                <option value="supervisor">supervisor</option>
                            </select>
                            : role
                            }
                        </td>
                    </tr>
                })}
            </tbody>
        </table>
    </>
}
