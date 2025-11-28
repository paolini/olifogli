"use client"
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
            console.error('Error updating setting:', err)
        }
    }
    
    if (!message && !profile?.isAdmin) {
        // Nessun messaggio e l'utente non è admin: non mostrare niente
        return null
    }
    
    return (
        <div className={`mx-4 my-4 max-w-4xl message ${className}`}>
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
                        <Button onClick={cancelEdit} disabled={updating}>
                            Annulla
                        </Button>
                    </div>
                    {updateError && <Error error={updateError} />}
                </div>
            ) : (
                <>
                    {(message || profile?.isAdmin) && (
                        <>
                            {isCollapsed ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-700 font-semibold text-base">{title}</span>
                                    <button
                                        type="button"
                                        onClick={handleToggleCollapse}
                                        className="ml-1 p-1 rounded-full hover:bg-indigo-100 focus:outline-none border border-gray-300"
                                        title="Apri"
                                    >
                                        <span className="text-indigo-600 text-lg" role="img" aria-label="Apri">▼</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="relative border border-gray-300 rounded-lg pt-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md">
                                    {title && (
                                        <div className="absolute left-6 -top-3 z-10 flex items-center gap-2 border">
                                            <span
                                                className="px-4 py-1 text-gray-700 font-semibold text-base bg-white"
                                                style={{
                                                    borderTop: 'none',
                                                    borderBottom: 'none',
                                                    position: 'relative',
                                                    top: 0
                                                }}
                                            >
                                                {title}
                                            </span>
                                            {typeof collapsed !== 'undefined' && (
                                                <button
                                                    type="button"
                                                    onClick={handleToggleCollapse}
                                                    className="ml-1 p-1 rounded-full hover:bg-indigo-100 focus:outline-none border border-gray-300"
                                                    title="Chiudi"
                                                >
                                                    <span className="text-indigo-600 text-lg" role="img" aria-label="Chiudi">▲</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <div className="prose prose-sm max-w-none">
                                        {message ? <ReactMarkdown>{message}</ReactMarkdown> : <span className="text-gray-400 italic">Admin: premi sulla matita per inserire un messaggio globale {title && `(${title})`}{description && ` — ${description}`}</span>}
                                    </div>
                                    {profile?.isAdmin && (
                                        <button
                                            type="button"
                                            onClick={startEdit}
                                            className="absolute top-2 right-2 px-1 rounded hover:bg-indigo-100 focus:outline-none"
                                            title={message ? 'Modifica messaggio' : 'Aggiungi messaggio'}
                                        >
                                            {/* Icona matita Unicode */}
                                            <span className="text-indigo-600 text-sm" role="img" aria-label="Modifica">✏️</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    )
}
