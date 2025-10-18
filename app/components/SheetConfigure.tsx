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
  mutation UpdateSheet($_id: ObjectId!, $permissions: [PermissionInput!], $commonData: Data) {
    updateSheet(_id: $_id, permissions: $permissions, commonData: $commonData)
  }
`

const DELETE_ALL_ROWS = gql`
  mutation DeleteAllRows($sheetId: ObjectId!) {
    deleteAllRows(sheetId: $sheetId)
  }
`

const CLOSE_SHEET = gql`
  mutation CloseSheet($_id: ObjectId!) {
    closeSheet(_id: $_id)
  }
`

const OPEN_SHEET = gql`
  mutation OpenSheet($_id: ObjectId!) {
    openSheet(_id: $_id)
  }
`

const LOCK_SHEET = gql`
  mutation LockSheet($_id: ObjectId!) {
    lockSheet(_id: $_id)
  }
`

const UNLOCK_SHEET = gql`
  mutation UnlockSheet($_id: ObjectId!) {
    unlockSheet(_id: $_id)
  }
`

export default function SheetConfigure({sheet, profile}: {
    sheet: Sheet
    profile: User | null
}) {
    const router = useRouter()
    const [deleteSheet, {loading: deleting, error: deleteError, reset: deleteReset}] = useDeleteSheetMutation()
    const [edit,setEdit] = useState(false)
    const [permissions, setPermissions] = useState(sheet.permissions || [])
    const [newEmail, setNewEmail] = useState('')
    const [newRole, setNewRole] = useState<'admin' | 'editor'>('editor')
    const [newFieldKey, setNewFieldKey] = useState('')
    const [newFieldValue, setNewFieldValue] = useState('')
    const [commonData, setCommonData] = useState<Data>(sheet.commonData || {})
    const [updateSheet, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_SHEET)
    const [deleteAllRows, {loading: clearingSheet, error: clearError, reset: clearReset}] = useMutation(DELETE_ALL_ROWS)
    const [closeSheet, {loading: closing, error: closeError, reset: closeReset}] = useMutation(CLOSE_SHEET)
    const [openSheet, {loading: opening, error: openError, reset: openReset}] = useMutation(OPEN_SHEET)
    const [lockSheet, {loading: locking, error: lockError, reset: lockReset}] = useMutation(LOCK_SHEET)
    const [unlockSheet, {loading: unlocking, error: unlockError, reset: unlockReset}] = useMutation(UNLOCK_SHEET)
    const canModifyData = profile?.isAdmin || profile?._id.toString() === sheet.ownerId?.toString()

    if (deleteError) return <Error error={deleteError} dismiss={deleteReset }/>
    if (updateError) return <Error error={updateError} dismiss={updateReset }/>
    if (clearError) return <Error error={clearError} dismiss={clearReset }/>
    if (closeError) return <Error error={closeError} dismiss={closeReset }/>
    if (openError) return <Error error={openError} dismiss={openReset }/>
    if (lockError) return <Error error={lockError} dismiss={lockReset }/>
    if (unlockError) return <Error error={unlockError} dismiss={unlockReset }/>

    return <>
        {!edit && 
            <Button onClick={() => setEdit(true)}>
                modifica
            </Button>}
        {edit && <>
                <Button className="mx-2" onClick={cancel}>
                    Annulla
                </Button>
                {sheet.locked ? (
                    profile?.isAdmin && (
                        <Button 
                            className="mx-2"
                            disabled={unlocking}
                            onClick={doUnlockSheet}
                        >
                            {unlocking ? 'Sblocco...' : 'Sblocca foglio'}
                        </Button>
                    )
                ) : sheet.closed ? (
                    canModifyData && (
                        <Button 
                            className="mx-2"
                            disabled={opening}
                            onClick={doOpenSheet}
                        >
                            {opening ? 'Apertura...' : 'Apri foglio'}
                        </Button>
                    )
                ) : (
                    <>
                        {canModifyData && (
                            <Button 
                                className="mx-2"
                                variant="alert" 
                                disabled={closing}
                                onClick={doCloseSheet}
                            >
                                {closing ? 'Chiusura...' : 'Chiudi foglio'}
                            </Button>
                        )}
                        {profile?.isAdmin && (
                            <Button 
                                className="mx-2"
                                variant="danger" 
                                disabled={locking}
                                onClick={doLockSheet}
                            >
                                {locking ? 'Blocco...' : 'Blocca foglio'}
                            </Button>
                        )}
                    </>
                )}
                {canModifyData &&
                    <Button className="mx-2" variant="danger" disabled={clearingSheet || sheet.nRows===0 || !!sheet.closed || !!sheet.locked} onClick={() => {
                        if (confirm(`Sei sicuro di voler svuotare questo foglio? Verranno eliminate ${sheet.nRows} righe.`)) {
                            doClearSheet()
                        }
                        }}>
                        Svuota questo foglio ({sheet.nRows} righe)
                    </Button>
                }
                {canModifyData && 
                    <Button className="mx-2" variant="danger" disabled={deleting || sheet.nRows>0} onClick={() => {
                        if (confirm("Sei sicuro di voler eliminare questo foglio?")) {
                            doDelete()
                        }
                        }}>
                        Elimina questo foglio
                    </Button>
                }
        </>}
        <table>
        <thead>
            <tr>
                <th className="bg-gray-200">permessi</th>
            </tr>
        </thead>
        <tbody>
          <tr>
            <th className="bg-gray-200">stato</th>
            <td>
              {sheet.locked ? (
                <>
                  <span className="text-red-600 font-semibold">Bloccato</span>
                  {sheet.lockedOn && (
                    <span className="text-sm text-gray-600 ml-2">
                      (da {sheet.lockedBy || 'sconosciuto'} il {new Date(sheet.lockedOn).toLocaleString()})
                    </span>
                  )}
                </>
              ) : sheet.closed ? (
                <>
                  <span className="text-orange-600 font-semibold">Chiuso</span>
                  {sheet.closedOn && (
                    <span className="text-sm text-gray-600 ml-2">
                      (da {sheet.closedBy || 'sconosciuto'} il {new Date(sheet.closedOn).toLocaleString()})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-green-600">Aperto</span>
              )}
            </td>
          </tr>
          {permissions.map((permission, index) => (
              <tr key={index}>
              <td>{permission.email || `ID: ${permission.userId}`} ({permission.role})</td>
              {edit && 
                <td><Button variant="danger" disabled={updating} onClick={() => removePermission(index)}>
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
              {} <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'editor')}>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </td>
            <td>
                <Button disabled={updating || !newEmail || !newEmail.includes('@')} onClick={addPermission}>
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
        setPermissions(sheet.permissions || [])
        setCommonData(sheet.commonData || {})
        setNewEmail('')
        setNewRole('editor')
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

    async function persistPermissions(next: typeof permissions) {
      setPermissions(next)
      // Keep only the fields defined in PermissionInput
      const cleanPermissions = next.map(permission => ({
        email: permission.email,
        userId: permission.userId,
        role: permission.role
      }))
      await updateSheet({ variables: { _id: sheet._id, permissions: cleanPermissions },
        refetchQueries: ['getSheet']
      })
    }

    async function persistCommonData(data = commonData) {
      await updateSheet({ variables: { _id: sheet._id, commonData: data },
        refetchQueries: ['getSheet']
      })
    }

    async function addPermission() {
      const email = newEmail.trim()
      if (!email) return
      if (permissions.some(p => p.email === email)) { setNewEmail(''); return }
      await persistPermissions([...permissions, { email, role: newRole }])
      setNewEmail('')
      setNewRole('editor')
    }

    async function removePermission(index: number) {
      await persistPermissions(permissions.filter((_, i) => i !== index))
    }

    async function doDelete() {
        await deleteSheet({variables: {_id: sheet._id}})
        router.push('/')
    }

    async function doClearSheet() {
        await deleteAllRows({
            variables: {sheetId: sheet._id},
            refetchQueries: ['getSheet', 'GetRows']
        })
        setEdit(false)
    }

    async function doCloseSheet() {
        if (!confirm("Se chiudi il foglio nessuno potrà modificarne le righe. Ma potrai riaprirlo se necessario.")) return
        await closeSheet({
            variables: {_id: sheet._id},
            refetchQueries: ['getSheet']
        })
    }

    async function doOpenSheet() {
        await openSheet({
            variables: {_id: sheet._id},
            refetchQueries: ['getSheet']
        })
    }

    async function doLockSheet() {
        if (!confirm("Sei sicuro di voler bloccare questo foglio? Solo gli amministratori di sistema potranno sbloccarlo.")) return
        await lockSheet({
            variables: {_id: sheet._id},
            refetchQueries: ['getSheet']
        })
    }

    async function doUnlockSheet() {
        await unlockSheet({
            variables: {_id: sheet._id},
            refetchQueries: ['getSheet']
        })
    }
}