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
      sheetsCount
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

const DELETE_WORKBOOK = gql`
  mutation DeleteWorkbook($_id: ObjectId!) {
    deleteWorkbook(_id: $_id)
  }
`

export default function Workbooks() {
  const profile = useProfile()
  const { loading, error, data, refetch } = useGetWorkbooksQuery()
  const [deleteWorkbook] = useMutation(DELETE_WORKBOOK, {
    refetchQueries: ['GetWorkbooks']
  })

  if (loading) return <Loading />
  if (error) return <Error error={error.message} />

  const workbooks = data?.workbooks ?? []

  const handleDeleteWorkbook = async (workbookId: string | null | undefined, workbookName: string | null | undefined) => {
    if (!workbookId || !workbookName) return
    
    if (confirm(`Sei sicuro di voler cancellare la raccolta "${workbookName}"?`)) {
      try {
        await deleteWorkbook({ variables: { _id: workbookId } })
      } catch (error) {
        console.error('Errore durante la cancellazione:', error)
      }
    }
  }

  return <div className="p-4 space-y-4">
    <h1>Raccolte</h1>
    <table className="table-auto">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2 pr-8">Nome</th>
          <th className="text-left p-2">Fogli</th>
          <th className="text-left p-2">Azioni</th>
        </tr>
      </thead>
      <tbody>
      {workbooks.map((workbook) => (
        workbook && (
          <tr key={workbook._id?.toString()}>
            <td className="p-2 pr-8">
              <Link href={`/workbook/${workbook._id}`} className="text-blue-600 hover:text-blue-800">
                {workbook.name}
              </Link>
            </td>
            <td className="p-2 text-gray-600 text-center">
              {workbook.sheetsCount}
            </td>
            <td className="p-2">
              {workbook.sheetsCount === 0 && workbook._id && workbook.name && (
                <Button 
                  onClick={() => handleDeleteWorkbook(workbook._id?.toString(), workbook.name)}
                  className="bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1"
                >
                  Cancella
                </Button>
              )}
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
  const [addWorkbook, { loading, error }] = useMutation(ADD_WORKBOOK, {
    refetchQueries: ['GetWorkbooks']
  })

  return <div className="flex items-center gap-2">
    <Input value={name} setValue={setName} onEnter={createWorkbook} />
    <Button disabled={!name || loading} onClick={createWorkbook}>Nuova raccolta</Button>
    <Error error={error} />
  </div>

  async function createWorkbook() {
    await addWorkbook({ variables: { name } })
    setName('')
  }
}
