"use client"

import Link from 'next/link'
import Error from './Error'
import Loading from './Loading'
import { gql } from '@apollo/client'
import { useGetWorkbooksQuery } from '../graphql/generated'

gql`query GetWorkbooks {
    workbooks {
      _id
      name
    }
  }
`

export default function Workbooks() {
  const { loading, error, data } = useGetWorkbooksQuery()

  if (loading) return <Loading />
  if (error) return <Error error={error.message} />

  const workbooks = data?.workbooks ?? []

  return (
    <div className="p-4">
      <h2>Workbooks</h2>
      <ul>
        {workbooks.map((workbook) => (
          workbook && (
            <li key={workbook._id?.toString()}>
              <Link href={`/workbook/${workbook._id}`}>
                {workbook.name}
              </Link>
            </li>
          )
        ))}
      </ul>
    </div>
  )
}
