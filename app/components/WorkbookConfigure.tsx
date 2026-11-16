'use client'

import { gql, useMutation } from '@apollo/client'
import { useState } from 'react'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { useRouter } from 'next/navigation'
import Button from './Button'
import ErrorMessage from './Error'
import WorkbookVariablesHelp from './WorkbookVariablesHelp'
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

type DataFormat = 'yaml' | 'json'

function formatData(data: Data, format: DataFormat) {
    return format === 'yaml' ? stringifyYaml(data) : JSON.stringify(data, null, 2)
}

function parseData(value: string, format: DataFormat): Data {
    const parsed = format === 'yaml' ? parseYaml(value) : JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Inserisci un oggetto con i nomi delle variabili e i relativi valori.')
    }
    // Both formats must contain data that can be sent as JSON to the server.
    JSON.stringify(parsed, (_key, value) => {
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new Error('I valori numerici devono essere finiti.')
        }
        return value
    })
    return parsed
}

export default function WorkbookConfigure({workbook, profile, sheetsCount}: {
    workbook: Workbook
    profile: User | null
    sheetsCount?: number
}) {
    const router = useRouter()
    const [deleteWorkbook, {loading: deleting, error: deleteError, reset: deleteReset}] = useMutation(DELETE_WORKBOOK)
    const [updateWorkbook, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_WORKBOOK)
    const [edit, setEdit] = useState(false)
    const [commonData, setCommonData] = useState<Data>(workbook.commonData || {})
    const [format, setFormat] = useState<DataFormat>('yaml')
    const [dataValue, setDataValue] = useState(() => formatData(workbook.commonData || {}, 'yaml'))
    const [validationError, setValidationError] = useState<string | null>(null)
    const canModify = profile?.isAdmin || profile?._id.toString() === workbook.ownerId?.toString()
    const busy = updating || deleting

    return (
        <div className="w-full max-w-6xl px-2">
            <label htmlFor="workbook-common-data" className="block mb-2 font-medium">
                Variabili del workbook
            </label>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <label htmlFor="workbook-data-format">Formato</label>
                <select
                    id="workbook-data-format"
                    className="p-1 border rounded"
                    value={format}
                    disabled={busy}
                    onChange={e => changeFormat(e.target.value as DataFormat)}
                >
                    <option value="yaml">YAML</option>
                    <option value="json">JSON</option>
                </select>
                {!edit && canModify && (
                    <Button onClick={() => {
                        setDataValue(formatData(commonData, format))
                        setValidationError(null)
                        updateReset()
                        setEdit(true)
                    }}>
                        Modifica
                    </Button>
                )}
                <Button onClick={copyToClipboard}>Copia {format.toUpperCase()}</Button>
            </div>
            {edit && canModify ? <textarea
                id="workbook-common-data"
                className="w-full h-80 resize p-2 border rounded font-mono text-sm"
                value={dataValue}
                onChange={e => {
                    setDataValue(e.target.value)
                    setValidationError(null)
                }}
                disabled={busy}
                spellCheck={false}
                aria-invalid={!!validationError}
                aria-describedby={validationError ? 'workbook-common-data-error' : undefined}
            /> : (
                <pre id="workbook-common-data" className="w-full overflow-auto p-2 border rounded bg-gray-100 font-mono text-sm">
                    {formatData(commonData, format)}
                </pre>
            )}
            {validationError && (
                <p id="workbook-common-data-error" role="alert" className="mt-2 text-red-600">
                    {validationError}
                </p>
            )}
            <ErrorMessage error={updateError} dismiss={updateReset}/>
            <ErrorMessage error={deleteError} dismiss={deleteReset}/>
            {edit && canModify && (
                <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={save} disabled={busy}>Salva</Button>
                    <Button disabled={busy} onClick={() => {
                        setDataValue(formatData(commonData, format))
                        setValidationError(null)
                        updateReset()
                        setEdit(false)
                    }}>
                        Annulla
                    </Button>
                    <Button variant="danger" disabled={busy || (sheetsCount || 0) > 0} onClick={async () => {
                        if (!confirm('Sei sicuro di voler eliminare questo workbook?')) return
                        try {
                            await deleteWorkbook({variables: {_id: workbook._id}})
                            router.push('/')
                        } catch {
                            // The mutation error is displayed above without losing the draft.
                        }
                    }}>
                        Elimina questo workbook
                    </Button>
                </div>
            )}
            <WorkbookVariablesHelp/>
        </div>
    )

    async function save() {
        let parsed: Data
        try {
            parsed = parseData(dataValue, format)
        } catch (error) {
            showParseError(error)
            return
        }
        setValidationError(null)
        try {
            await updateWorkbook({
                variables: {_id: workbook._id, commonData: parsed},
                refetchQueries: ['GetWorkbook']
            })
            setCommonData(parsed)
            setDataValue(formatData(parsed, format))
            setEdit(false)
        } catch {
            // The mutation error is displayed above without losing the draft.
        }
    }

    function showParseError(error: unknown) {
        const detail = error instanceof Error ? error.message : 'Controlla la sintassi.'
        setValidationError(`${format.toUpperCase()} non valido. ${detail}`)
    }

    function changeFormat(nextFormat: DataFormat) {
        try {
            const data = edit ? parseData(dataValue, format) : commonData
            setDataValue(formatData(data, nextFormat))
            setFormat(nextFormat)
            setValidationError(null)
        } catch (error) {
            showParseError(error)
        }
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(edit ? dataValue : formatData(commonData, format))
            alert(`${format.toUpperCase()} copiato nella clipboard`)
        } catch {
            alert('Errore nella copia')
        }
    }
}
