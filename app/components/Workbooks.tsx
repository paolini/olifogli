"use client"

import Link from 'next/link'
import Error from './Error'
import Loading from './Loading'
import { gql, useMutation } from '@apollo/client'
import { useGetWorkbooksQuery } from '../graphql/generated'
import useProfile from '../lib/useProfile'
import Button from './Button'
import { Input } from './Input'
import { useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
gql`query GetWorkbooks {
    workbooks {
      _id
      name
    }
  }
`

const ADD_WORKBOOK = gql`
  mutation AddWorkbook($name: String!) {
    addWorkbook(name: $name) {
      _id
      name
    }
  }
`

export default function Workbooks() {
  const profile = useProfile()
  const { loading, error, data, refetch } = useGetWorkbooksQuery()

  if (loading) return <Loading />
  if (error) return <Error error={error.message} />

  const workbooks = data?.workbooks ?? []

  return <div className="p-4 space-y-4">
    <h1>Raccolte</h1>
    <table>
      <tbody>
      {workbooks.map((workbook) => (
        workbook && (
          <tr key={workbook._id?.toString()}>
            <td className="p-1">
              <Link href={`/workbook/${workbook._id}`}>
                {workbook.name}
              </Link>
            </td>
          </tr>
        )
      ))}
      </tbody>
    </table>
    {profile?.isAdmin && <NewWorkbookForm />}
  </div>
}

function NewWorkbookForm() {
  const [name, setName] = useState('')
  const [addWorkbook, { loading, error, reset }] = useMutation(ADD_WORKBOOK, {
    refetchQueries: ['GetWorkbooks']
  })

  return <div className="flex items-center gap-2">
    <Input value={name} setValue={setName} onEnter={createWorkbook} />
    <Button disabled={!name || loading} onClick={createWorkbook}>Nuova raccolta</Button>
    <Error error={error} dismiss={reset} />
  </div>

  async function createWorkbook() {
    await addWorkbook({ variables: { name } })
    setName('')
  }
}
