import { gql, useMutation } from '@apollo/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from './Button'
import Error from './Error'
import { Sheet, useDeleteSheetMutation, User } from '@/app/graphql/generated'
import { Data } from '../lib/models'

const DELETE_SHEET = gql`
    mutation DeleteSheet($_id: ObjectId!) {
        deleteSheet(_id: $_id)
    }`

const UPDATE_SHEET = gql`
  mutation UpdateSheet($_id: ObjectId!, $permittedEmails: [String!], $commonData: Data) {
    updateSheet(_id: $_id, permittedEmails: $permittedEmails, commonData: $commonData)
  }
`

export default function SheetConfigure({sheet, profile}: {
    sheet: Sheet
    profile: User | null
}) {
    const router = useRouter()
    const [deleteSheet, {loading: deleting, error: deleteError, reset: deleteReset}] = useDeleteSheetMutation()
    const [edit,setEdit] = useState(false)
    const [emails, setEmails] = useState<string[]>(sheet.permittedEmails || [])
    const [newEmail, setNewEmail] = useState('')
    const [newFieldKey, setNewFieldKey] = useState('')
    const [newFieldValue, setNewFieldValue] = useState('')
    const [commonData, setCommonData] = useState<Data>(sheet.commonData || {})
    const [updateSheet, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_SHEET)
    const canModifyData = profile?.isAdmin || profile?._id.toString() === sheet.ownerId?.toString()

    if (deleteError) return <Error error={deleteError} dismiss={deleteReset }/>
    if (updateError) return <Error error={updateError} dismiss={updateReset }/>

    return <>
        {!edit && 
            <Button onClick={() => setEdit(true)}>
                modifica
            </Button>}
        {edit && <>
                <Button onClick={cancel}>
                    Annulla
                </Button>
                {} {canModifyData && <Button variant="danger" disabled={deleting} onClick={() => {confirm("Sei sicuro di voler eliminare questo foglio?") && doDelete()}}>
                    Elimina questo foglio
                </Button>}
        </>}
        <table>
        <thead>
            <tr>
                <th className="bg-gray-200">permessi</th>
            </tr>
        </thead>
        <tbody>
          {emails.map((email) => (
              <tr key={email}>
              <td>{email}</td>
              {edit && 
                <td><Button variant="danger" disabled={updating} onClick={() => removeEmail(email)}>
                    rimuovi
                </Button></td>}
            </tr>
          ))}
          {edit &&
          <tr>
            <td>
            <input
              type="email"
              value={newEmail}
              placeholder="nuova email"
              onChange={e => setNewEmail(e.target.value)}
              />
            </td>
            <td>
                <Button disabled={updating || !newEmail || !newEmail.includes('@')} onClick={addEmail}>
                    Aggiungi
                </Button>
            </td>
          </tr>}
        </tbody>
        </table>

        <table className="my-2">
            <thead>
                <tr>
                    <th className="bg-gray-200">campo</th>
                    <th className="bg-gray-200">valore</th>
                    {edit && canModifyData && <th className="bg-gray-200"></th>}
                </tr>
            </thead>
            <tbody>
                {Object.entries(commonData as Data).map(([key,value])=> <tr key={key}>
                    <th className="bg-gray-200">{key.replace('_',' ')}</th>
                    {edit && canModifyData ? (
                        <td>
                            <input
                                type="text"
                                value={value as string || ''}
                                onChange={e => updateCommonDataField(key, e.target.value)}
                                disabled={updating}
                            />
                        </td>
                    ) : (
                        <td>{value}</td>
                    )}
                    {edit && canModifyData && 
                        <td>
                            <Button variant="danger" disabled={updating} onClick={() => removeCommonDataField(key)}>
                                rimuovi
                            </Button>
                        </td>
                    }
                </tr>)}
                {edit && canModifyData &&
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
        setEmails(sheet.permittedEmails || [])
        setCommonData(sheet.commonData || {})
        setNewEmail('')
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

    async function persistEmails(next: string[]) {
      setEmails(next)
      await updateSheet({ variables: { _id: sheet._id, permittedEmails: next },
        refetchQueries: ['getSheet']
      })
    }

    async function persistCommonData(data = commonData) {
      await updateSheet({ variables: { _id: sheet._id, commonData: data },
        refetchQueries: ['getSheet']
      })
    }

    async function addEmail() {
      const email = newEmail.trim()
      if (!email) return
      if (emails.includes(email)) { setNewEmail(''); return }
      await persistEmails([...emails, email])
      setNewEmail('')
    }

    async function removeEmail(email: string) {
      await persistEmails(emails.filter(e => e !== email))
    }

    async function doDelete() {
        await deleteSheet({variables: {_id: sheet._id}})
        router.push('/')
    }
}