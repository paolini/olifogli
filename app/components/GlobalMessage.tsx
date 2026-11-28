"use client"
import { logDiagnostic } from '../lib/logging'
import { useState } from 'react'
import { gql, useQuery, useMutation } from '@apollo/client'
import ReactMarkdown from 'react-markdown'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import Button from './Button'
import Error from './Error'
import useProfile from '../lib/useProfile'

const GET_SETTING = gql`
  query GetSetting($key: String!) {
    getSetting(key: $key) {
      _id
      key
      value
      updatedBy
      updatedOn
    }
  }
`

const UPDATE_SETTING = gql`
  mutation UpdateSetting($key: String!, $value: String!) {
    updateSetting(key: $key, value: $value) {
      _id
      key
      value
      updatedBy
      updatedOn
    }
  }
`

export default function GlobalMessage({name, title, description, collapsed, className}: {name: string, title?: string, description?: string, collapsed?: boolean, className?: string}) {
    const profile = useProfile()
    const [editing, setEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    const [isCollapsed, setIsCollapsed] = useState(!!collapsed)
    const key = name // key è riservato come nome di una proprietà di un elemento React
    const handleToggleCollapse = () => setIsCollapsed((prev) => !prev)
    const collapsible = typeof collapsed !== 'undefined'

    const { data, loading, error } = useQuery(GET_SETTING, {
        variables: { key }
    })

    const [updateSetting, { loading: updating, error: updateError }] = useMutation(UPDATE_SETTING, {
        refetchQueries: ['GetSetting']
    })

    if (loading) return null
    if (error) return <Error error={error} />

    const setting = data?.getSetting
    const message = setting?.value || ''

    const startEdit = () => {
        setEditValue(message)
        setEditing(true)
    }

    const cancelEdit = () => {
        setEditing(false)
        setEditValue('')
    }

    const saveEdit = async () => {
        try {
            await updateSetting({
                variables: {
                    key,
                    value: editValue
                }
            })
            setEditing(false)
        } catch (err) {
            logDiagnostic('app/components/GlobalMessage.error_updating_setting', err)
        }
    }

    if (!message && !profile?.isAdmin) {
        // Nessun messaggio e l'utente non è admin: non mostrare niente
        return null
    }

    return (
        <div className={`mx-4 my-4 max-w-4xl message ${className || ''}`}>
            {editing ? (
                <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            {title || 'Messaggio globale (Markdown)'}
                        </label>
                        {description && (
                            <div className="text-xs text-gray-500 mb-2">{description}</div>
                        )}
                        <MDEditor
                            value={editValue}
                            onChange={(val) => setEditValue(val || '')}
                            preview="live"
                            height={400}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={saveEdit} disabled={updating}>
                            {updating ? 'Salvataggio...' : 'Salva'}
                        </Button>
                        <Button variant="secondary" onClick={cancelEdit} disabled={updating}>
                            Annulla
                        </Button>
                    </div>
                    {updateError && <Error error={updateError} />}
                </div>
            ) : (
                <div>
                    {(title || profile?.isAdmin) && (
                        <div className="flex items-center gap-2">
                            {collapsible ? (
                                <button
                                    type="button"
                                    onClick={handleToggleCollapse}
                                    aria-expanded={!isCollapsed}
                                    className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                                >
                                    <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                                    <span>{title}</span>
                                </button>
                            ) : (
                                title && <span className="text-gray-700 font-semibold">{title}</span>
                            )}
                            {profile?.isAdmin && !isCollapsed && (
                                <button
                                    type="button"
                                    onClick={startEdit}
                                    className="ml-auto cursor-pointer border-0 bg-transparent px-1 rounded hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                    title={message ? 'Modifica messaggio' : 'Aggiungi messaggio'}
                                >
                                    <span className="text-indigo-700" role="img" aria-label="Modifica">{'\u270F\uFE0E'}</span>
                                </button>
                            )}
                        </div>
                    )}
                    {!isCollapsed && (
                        <div className={`prose prose-sm max-w-none ${title ? 'mt-1 pl-4 pt-1 border-t border-gray-200' : ''}`}>
                            {message ? <ReactMarkdown>{message}</ReactMarkdown> : <span className="text-gray-400 italic">Admin: premi sulla matita per inserire un messaggio globale {title && `(${title})`}{description && ` — ${description}`}</span>}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
