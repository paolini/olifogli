'use client'

import { gql, useMutation } from '@apollo/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from './Button'
import Error from './Error'
import { Workbook, User } from '@/app/graphql/generated'
import { Data } from '../lib/models'

const UPDATE_WORKBOOK = gql`
  mutation UpdateWorkbook($_id: ObjectId!, $commonData: Data) {
    updateWorkbook(_id: $_id, commonData: $commonData)
  }
`

const DELETE_WORKBOOK = gql`
  mutation DeleteWorkbook($_id: ObjectId!) {
    deleteWorkbook(_id: $_id)
  }
`

export default function WorkbookConfigure({workbook, profile, sheetsCount}: {
    workbook: Workbook
    profile: User | null
    sheetsCount?: number
}) {
    const router = useRouter()
    const [deleteWorkbook, {loading: deleting, error: deleteError, reset: deleteReset}] = useMutation(DELETE_WORKBOOK)
    const [edit, setEdit] = useState(false)
    const [newFieldKey, setNewFieldKey] = useState('')
    const [newFieldValue, setNewFieldValue] = useState('')
    const [commonData, setCommonData] = useState<Data>(workbook.commonData || {})
    const [updateWorkbook, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_WORKBOOK)
    const canModify = profile?.isAdmin || profile?._id.toString() === workbook.ownerId?.toString()

    if (deleteError) return <Error error={deleteError} dismiss={deleteReset}/>
    if (updateError) return <Error error={updateError} dismiss={updateReset}/>

    return <>
        {!edit && canModify && 
            <Button onClick={() => setEdit(true)}>
                modifica
            </Button>}
        {edit && <>
                <Button className="mx-2" onClick={cancel}>
                    Annulla
                </Button>
                {canModify && 
                    <Button className="mx-2" variant="danger" disabled={deleting || (sheetsCount || 0) > 0} onClick={() => {
                        if (confirm("Sei sicuro di voler eliminare questo workbook?")) {
                            doDelete()
                        }
                        }}>
                        Elimina questo workbook
                    </Button>
                }
        </>}

        <table className="my-2">
            <thead>
                <tr>
                    <th className="bg-gray-200">campo</th>
                    <th className="bg-gray-200">valore</th>
                    {edit && canModify && <th className="bg-gray-200"></th>}
                </tr>
            </thead>
            <tbody>
                {Object.entries(commonData as Data).map(([key, value]) => <tr key={key}>
                    <th className="bg-gray-200">{key}</th>
                    {edit && canModify ? (
                        <td className="workbook-data-value">
                            <input
                                type="text"
                                size={40}
                                value={value as string || ''}
                                onChange={e => updateCommonDataField(key, e.target.value)}
                                disabled={updating}
                            />
                        </td>
                    ) : (
                        <td className="workbook-data-value">{value}</td>
                    )}
                    {edit && canModify && 
                        <td>
                            <Button variant="danger" disabled={updating} onClick={() => removeCommonDataField(key)}>
                                rimuovi
                            </Button>
                        </td>
                    }
                </tr>)}
                {edit && canModify &&
                    <tr>
                        <td>
                            <input
                                type="text"
                                value={newFieldKey}
                                placeholder="nome campo"
                                onChange={e => setNewFieldKey(e.target.value)}
                            />
                        </td>
                        <td>
                            <input
                                type="text"
                                size={40}
                                value={newFieldValue}
                                placeholder="valore"
                                onChange={e => setNewFieldValue(e.target.value)}
                            />
                        </td>
                        <td>
                            <Button disabled={updating || !newFieldKey || !!commonData[newFieldKey]} onClick={addCommonDataField}>
                                Aggiungi
                            </Button>
                        </td>
                    </tr>
                }
            </tbody>
        </table>
    </>

    function cancel() {
        setCommonData(workbook.commonData || {})
        setNewFieldKey('')
        setNewFieldValue('')
        setEdit(false)
    }

    function updateCommonDataField(key: string, value: string) {
        const newData = { ...commonData, [key]: value }
        setCommonData(newData)
        persistCommonData(newData)
    }

    async function addCommonDataField() {
        const key = newFieldKey.trim()
        const value = newFieldValue.trim()
        if (!key || commonData[key]) return
        const newData = { ...commonData, [key]: value }
        setCommonData(newData)
        await persistCommonData(newData)
        setNewFieldKey('')
        setNewFieldValue('')
    }

    async function removeCommonDataField(key: string) {
        const newData = { ...commonData }
        delete newData[key]
        setCommonData(newData)
        await persistCommonData(newData)
    }

    async function persistCommonData(data = commonData) {
      await updateWorkbook({ 
        variables: { _id: workbook._id, commonData: data },
        refetchQueries: ['GetWorkbook']
      })
    }

    async function doDelete() {
        await deleteWorkbook({variables: {_id: workbook._id}})
        router.push('/')
    }
}
