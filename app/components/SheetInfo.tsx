import Loading from '@/app/components/Loading'
import ReactMarkdown from 'react-markdown'
import { gql, useMutation } from '@apollo/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from './Button'
import Error from './Error'
import {Row, Sheet, User, useDeleteSheetMutation } from '@/app/graphql/generated'
import { Data } from '../lib/models'
import { myTimestamp, pluralize } from '../lib/util'
import { schemas } from '../lib/schema'
import GlobalMessage from './GlobalMessage'

export default function SheetInfo({sheet,data,profile}:{
    sheet: Sheet
    data?: {rows: Row[]}
    profile: User | null
}) {
    const rows = data?.rows
    const n_valid_rows = rows?.filter(r => !r.error).length || 0
    
    if (rows === undefined) return <Loading />
    const sheetContainsErrors = !!(data?.rows.filter(row => row.error!=='').length)

    return <>
        <GlobalMessage name="panel_instructions" title="istruzioni" collapsed={true} />
        <SheetInfoPanel sheet={sheet} profile={profile} />
        <div>
              <span><b>{pluralize(rows.length, "riga", "righe")}</b></span>
              {' • '}
              <span><b>{pluralize(n_valid_rows, "valida", "valide")}</b></span>
              {sheet.anomalies > 0 && <>{' • '}<span><b>{pluralize(sheet.anomalies, "anomalia", "anomalie")}</b></span></>}
              {n_valid_rows < rows.length && <>{' • '}<span>non è possibile chiudere il foglio</span></>}
              <br />
        </div>
        
        <SheetConfigure sheet={sheet} profile={profile} sheetContainsErrors={sheetContainsErrors} />
    </>
}

function SheetInfoPanel({sheet,profile}:{
    sheet: Sheet
    profile: User | null
}) {
    const [edit,setEdit] = useState(false)
    const schema = schemas[sheet.schema]
    const canModifySensibleData = profile?.isAdmin || profile?._id.toString() === sheet.ownerId?.toString()

    if (!edit) {
        return <>
            <PanelDisplay sheet={sheet} />
            {canModifySensibleData && 
            <Button className="mb-4" onClick={() => setEdit(true)}>⚙ modifica</Button>}
        </>
    } else {
        return <>
            <PanelEdit sheet={sheet} profile={profile} />
            <Button className="mb-4"onClick={() => setEdit(false)}>⚙ chiudi modifica</Button>
        </>
    }
}

function PanelDisplay({sheet}: {
    sheet: Sheet
}) {
    const schema = schemas[sheet.schema]

    const { tabular, cards } = schema.customized_common_data(sheet.commonData)

    return <>
        <table className="commondata">
            <tbody>
                { tabular.map(([Key,value]) => 
                    <tr key={Key}>
                        <th>{Key}</th>
                        <td>{value}</td>
                    </tr>
                )}
            </tbody>
        </table>
        { cards.map(([key,value]) => 
                <div key={key} className="relative border border-gray-600 rounded-lg my-4 p-4 max-w-2xl bg-gray-50 shadow-md">
                    {key && <div className="absolute -top-3 left-4 px-2 py-0.5 bg-white text-sm font-semibold text-gray-700">{key}</div>}
                    <ReactMarkdown>{value}</ReactMarkdown>
                </div>
        )}
    </>
}

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

function PanelEdit({sheet,profile}: {
    sheet: Sheet
    profile: User | null
}) {
    const [updateSheet, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_SHEET)
    const [newFieldKey, setNewFieldKey] = useState('')
    const [newFieldValue, setNewFieldValue] = useState('')
    const [commonData, setCommonData] = useState<Data>(sheet.commonData || {})
    const [deleteSheet, {loading: deleting, error: deleteError, reset: deleteReset}] = useDeleteSheetMutation()
    // questi utenti possono modificare i commondata del foglio oltre 
    // che tutto il resto
    const canModifySensibleData = profile?.isAdmin || profile?._id.toString() === sheet.ownerId?.toString()
    // questi utenti possono aprire/chiudere ma non bloccare.
    // possono anche gestire i permessi di acceso al foglio (altri utenti)
    const canConfigureSheet = profile?.isAdmin || (profile && sheet.permissions.some(p => p.userId === profile._id && p.role === 'admin'))

    if (deleteError) return <Error error={deleteError} dismiss={deleteReset }/>

    return <>
        <table className="my-2">
            <thead>
                <tr>
                    <th className="bg-gray-200">campo</th>
                    <th className="bg-gray-200">valore</th>
                </tr>
            </thead>
            <tbody>
                {Object.entries(commonData as Data).map(([key,value])=> <tr key={key}>
                    <th className="bg-gray-200">{key.replace('_',' ')}</th>
                    {canModifySensibleData ? (
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
                    {canModifySensibleData && 
                        <td>
                            <Button variant="danger" disabled={updating} onClick={() => removeCommonDataField(key)}>
                                rimuovi
                            </Button>
                        </td>
                    }
                </tr>)}
                {canModifySensibleData &&
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
 
    async function persistCommonData(data = commonData) {
      await updateSheet({ variables: { _id: sheet._id, commonData: data },
        refetchQueries: ['getSheet']
      })
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
}

function SheetConfigure({sheet, profile, sheetContainsErrors}: {
    sheet: Sheet
    profile: User | null
    sheetContainsErrors: boolean
}) {
    const router = useRouter()
    const [deleteSheet, {loading: deleting, error: deleteError, reset: deleteReset}] = useDeleteSheetMutation()
    const [permissions, setPermissions] = useState(sheet.permissions || [])
    const [newEmail, setNewEmail] = useState('')
    const [newRole, setNewRole] = useState<'admin' | 'editor' | 'view'>('editor')
    const [updateSheet, {loading: updating, error: updateError, reset: updateReset}] = useMutation(UPDATE_SHEET)
    const [deleteAllRows, {loading: clearingSheet, error: clearError, reset: clearReset}] = useMutation(DELETE_ALL_ROWS)
    const [closeSheet, {loading: closing, error: closeError, reset: closeReset}] = useMutation(CLOSE_SHEET)
    const [openSheet, {loading: opening, error: openError, reset: openReset}] = useMutation(OPEN_SHEET)
    const [lockSheet, {loading: locking, error: lockError, reset: lockReset}] = useMutation(LOCK_SHEET)
    const [unlockSheet, {loading: unlocking, error: unlockError, reset: unlockReset}] = useMutation(UNLOCK_SHEET)
    // questi utenti possono modificare i commondata del foglio oltre 
    // che tutto il resto
    const canModifySensibleData = profile?.isAdmin || profile?._id.toString() === sheet.ownerId?.toString()
    // questi utenti possono aprire/chiudere ma non bloccare.
    // possono anche gestire i permessi di acceso al foglio (altri utenti)
    const canConfigureSheet = profile?.isAdmin || (profile && sheet.permissions.some(p => (p.userId && p.userId === profile._id || p.email && p.email === profile.email) && p.role === 'admin'))

    const schema = schemas[sheet.schema]
    const countSheetAdmins = sheet.permissions.filter(p => p.role === 'admin').length
    const myEmail = profile?.email || ''

    if (deleteError) return <Error error={deleteError} dismiss={deleteReset }/>
    if (updateError) return <Error error={updateError} dismiss={updateReset }/>
    if (clearError) return <Error error={clearError} dismiss={clearReset }/>
    if (closeError) return <Error error={closeError} dismiss={closeReset }/>
    if (openError) return <Error error={openError} dismiss={openReset }/>
    if (lockError) return <Error error={lockError} dismiss={lockReset }/>
    if (unlockError) return <Error error={unlockError} dismiss={unlockReset }/>

    const ROLE_LABELS: Record<string, string> = {
        'admin': 'responsabile',
        'editor': 'aiutante',
        'view': 'supervisore'
    }

    return <>
            <table className="my-2 commondata"><tbody><tr>
                <th>Stato del foglio {schema?.header_essential}</th>
                { sheet.locked && 
                    <>
                    <td><span className="text-red-600 font-semibold">finalizzato</span></td>
                    <td><Button className="mx-4" disabled={!canModifySensibleData}>apri</Button></td>
                    {profile?.isAdmin && <td>
                        <span className="text-sm text-gray-600 ml-2">
                        ⚙ bloccato da {sheet.lockedBy || 'sconosciuto'} 
                        {} il {myTimestamp(sheet.lockedOn)}
                        </span></td>}
                    </>
                }
                { !sheet.locked && sheet.closed &&
                    <>
                    <td><span className="text-orange-600 font-semibold">chiuso</span></td>
                    <td><Button disabled={!canConfigureSheet} className="mx-4" onClick={doOpenSheet}>
                        apri
                    </Button></td>
                    {profile?.isAdmin && <td>
                        ⚙ <span className="text-sm text-gray-600 ml-2">
                        chiuso da {sheet.closedBy || 'sconosciuto'} 
                        {} il {myTimestamp(sheet.closedOn)}
                        </span></td>}
                    </>
                }
                { !sheet.locked && !sheet.closed &&<>
                    <td><span className="text-green-600 font-semibold">aperto</span></td>
                    <td><Button className="mx-4" variant="danger" disabled={!canConfigureSheet} onClick={doCloseSheet}>
                        chiudi
                        </Button>
                    </td>
                </>}
                </tr></tbody>
            </table>

        <table className="commondata">
        <thead>
            <tr>
                <th>email</th><th>permessi</th><th></th>
            </tr>
        </thead>
        <tbody>
          {permissions.map((permission, index) => (
              <tr key={index}>
              <td>{permission.email || `ID: ${permission.userId}`}</td>
              <td>{ROLE_LABELS[permission.role]}</td>
                <td>{<Button variant="danger" disabled={updating || (profile?.email===permission.email && !profile?.isAdmin)} onClick={() => removePermission(index)}>
                    rimuovi
                </Button>}</td>
            </tr>
          ))}
          {permissions.length === 0 && 
            <tr><td>Nessun permesso configurato</td></tr>
          }
          <tr>
            <td>
            <input
              type="email"
              value={newEmail}
              placeholder="nuova email"
              onChange={e => setNewEmail(e.target.value)}
              />
            </td><td>
              {} <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'editor' | 'view')}>
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </td>
            <td>
                <Button disabled={updating || !newEmail || !newEmail.includes('@') 
                    || (newEmail===myEmail && countSheetAdmins===1 && !profile?.isAdmin)} 
                    onClick={addPermission}>
                    Aggiungi
                </Button>
            </td>
          </tr>
        </tbody>
        </table>
        <div className="mb-4">
            Legenda:
            <ul className="list-disc list-inside">
                <li><b>responsabile</b>: può dare/togliere i permessi di accesso e chiudere il foglio</li>
                <li><b>aiutante</b>: può aggiungere/modificare/rimuovere righe nel foglio</li>
                <li><b>supervisore</b>: può solo visualizzare le righe del foglio</li>
            </ul>
        </div>
        <div>
        { canModifySensibleData && 
            <Button className="mx-2" variant="danger" disabled={clearingSheet || sheet.nRows===0 || !!sheet.closed || !!sheet.locked} onClick={() => {
                if (confirm(`Sei sicuro di voler svuotare questo foglio? Verranno eliminate ${sheet.nRows} righe.`)) {
                    doClearSheet()
                }
                }}>
                ⚙ Svuota questo foglio ({sheet.nRows} righe)
            </Button>
        }
        { canModifySensibleData && 
            <Button className="mx-2" variant="danger" disabled={deleting || sheet.nRows>0} onClick={() => {
                if (confirm("Sei sicuro di voler eliminare questo foglio? Questa operazione è irreversibile.")) {
                    doDelete()
                }
                }}>
                ⚙ Elimina questo foglio
            </Button>
        }
        </div>
    </>

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

    async function addPermission() {
      const email = newEmail.trim()
      if (!email) return
      await persistPermissions([...permissions.filter(p => p.email !== email), { email, role: newRole }])
      setNewEmail('')
      setNewRole('editor')
    }

    async function removePermission(index: number) {
        if (!confirm(`Sei sicuro di voler rimuovere i permessi per ${permissions[index].email || `ID: ${permissions[index].userId}`}?`)) return
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
    }

    async function doCloseSheet() {
        if (sheet.anomalies && !confirm("Ci sono delle anomalie nelle righe valide di questo foglio. Sei sicuro di volerlo chiudere lo stesso?")) return
        if (!confirm("Se chiudi il foglio nessuno potrà modificarne le righe e permetterai la finalizzazione dei dati. Finché non verrà finalizzato dagli amministratori potrai riaprirlo se necessario.")) return
        await closeSheet({
            variables: {_id: sheet._id},
            refetchQueries: ['getSheet']
        })
    }

    async function doOpenSheet() {
        if (!confirm("Sei sicuro di voler riaprire questo foglio? Gli aiutanti potranno nuovamente modificarlo, e impedirai la finalizzazione dati.")) return
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
