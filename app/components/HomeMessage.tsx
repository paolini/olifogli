"use client"
import { useState } from 'react'
import { gql, useQuery, useMutation } from '@apollo/client'
import ReactMarkdown from 'react-markdown'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import Button from './Button'
import Loading from './Loading'
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

export default function HomeMessage() {
    const profile = useProfile()
    const [editing, setEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    
    const { data, loading, error } = useQuery(GET_SETTING, {
        variables: { key: 'home_message' }
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
                    key: 'home_message',
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
        <div className="my-6 max-w-4xl">
            {editing ? (
                <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Messaggio della home page (Markdown)
                        </label>
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
                    {message && (
                        <div className="relative border border-gray-300 rounded-lg p-6 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md">
                            <div className="prose prose-sm max-w-none">
                                <ReactMarkdown>{message}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                    {profile?.isAdmin && (
                        <div className="mt-4">
                            <Button onClick={startEdit}>
                                {message ? 'Modifica messaggio' : 'Aggiungi messaggio'}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
