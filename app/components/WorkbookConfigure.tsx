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
    // Funzione per copiare il JSON nella clipboard
    function copyJsonToClipboard() {
    const text = showJson && edit ? jsonValue : JSON.stringify(commonData, null, 2)
        if (navigator && navigator.clipboard) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    alert('JSON copiato nella clipboard')
                })
                .catch(() => {
                    alert('Errore nella copia')
                })
        } else {
            alert('Clipboard API non disponibile')
        }
    }
        const router = useRouter()
        const [deleteWorkbook, {loading: deleting, error: deleteError, reset: deleteReset}] = useMutation(DELETE_WORKBOOK)
        const [edit, setEdit] = useState(false)
        const [newFieldKey, setNewFieldKey] = useState('')
        const [newFieldValue, setNewFieldValue] = useState('')
        const [commonData, setCommonData] = useState<Data>(workbook.commonData || {})
        const [updateWorkbook, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_WORKBOOK)
        const canModify = profile?.isAdmin || profile?._id.toString() === workbook.ownerId?.toString()
        const [showJson, setShowJson] = useState(false)
    // jsonEdit non serve, usiamo solo edit
    const [jsonValue, setJsonValue] = useState(JSON.stringify(workbook.commonData || {}, null, 2))

    if (deleteError) return <Error error={deleteError} dismiss={deleteReset}/>
    if (updateError) return <Error error={updateError} dismiss={updateReset}/>

    return (
    <div className="max-w-xl px-2">
        <div className="flex items-center mb-2">
            <input
                type="checkbox"
                id="show-json"
                checked={showJson}
                onChange={e => {
                    setShowJson(e.target.checked)
                    setEdit(false)
                }}
                className="mr-2"
            />
            <label htmlFor="show-json">Visualizza variabili in formato JSON</label>
        </div>
        {/* Pulsante modifica sempre visibile se canModify */}
        {!edit && canModify && (
            <Button onClick={() => {
                if (showJson) {
                    setJsonValue(JSON.stringify(commonData, null, 2))
                }
                setEdit(true)
            }}>
                modifica
            </Button>
        )}
        {/* Modalità JSON visualizzazione */}
        {showJson && !edit && (
            <div>
                <div className="mb-2 flex gap-2">
                    <Button onClick={copyJsonToClipboard} variant="default">Copia JSON</Button>
                </div>
                <pre className="bg-gray-100 p-2 rounded text-xs mb-4 max-w-full overflow-auto">
                    {JSON.stringify(commonData, null, 2)}
                </pre>
            </div>
        )}
        {/* Modalità JSON modifica */}
        {showJson && edit && canModify && (
            <div className="mb-4">
                <div className="mb-2 flex gap-2">
                    <Button onClick={copyJsonToClipboard} variant="default">Copia JSON</Button>
                </div>
                <textarea
                    className="w-full h-48 p-2 border rounded font-mono text-xs"
                    value={jsonValue}
                    onChange={e => setJsonValue(e.target.value)}
                    disabled={updating}
                />
                <div className="mt-2 flex gap-2">
                    <Button
                        onClick={async () => {
                            try {
                                const parsed = JSON.parse(jsonValue)
                                setCommonData(parsed)
                                await persistCommonData(parsed)
                                setEdit(false)
                            } catch (err) {
                                alert('JSON non valido')
                            }
                        }}
                        disabled={updating}
                    >
                        Salva
                    </Button>
                    <Button variant="default" onClick={() => setEdit(false)}>
                        Annulla
                    </Button>
                </div>
            </div>
        )}
        {/* Modalità tabella */}
        {!showJson && (
            <>
                {edit && (
                    <>
                        <Button className="mx-2" onClick={cancel}>
                            termina modifiche
                        </Button>
                        {canModify && (
                            <Button className="mx-2" variant="danger" disabled={deleting || (sheetsCount || 0) > 0} onClick={() => {
                                if (confirm("Sei sicuro di voler eliminare questo workbook?")) {
                                    doDelete()
                                }
                            }}>
                                Elimina questo workbook
                            </Button>
                        )}
                    </>
                )}
                <table className="my-2">
                    <thead>
                        <tr>
                            <th className="bg-gray-200">campo</th>
                            <th className="bg-gray-200">valore</th>
                            {edit && canModify && <th className="bg-gray-200"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(commonData as Data).map(([key, value]) => (
                            <tr key={key}>
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
                                {edit && canModify && (
                                    <td>
                                        <Button variant="danger" disabled={updating} onClick={() => removeCommonDataField(key)}>
                                            rimuovi
                                        </Button>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {edit && canModify && (
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
                        )}
                    </tbody>
                </table>
            </>
        )}
    </div>
    )

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
