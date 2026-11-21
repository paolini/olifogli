import React, { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import Error from '@/app/components/Error'
import { schemas } from '../lib/schema'
import { gql } from '@apollo/client'
import { useAddSheetMutation } from '../graphql/generated';

const __ = gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!, $permissions: [PermissionInput!]) {
        addSheet(name: $name, schema: $schema, workbookId: $workbookId, permissions: $permissions)
    }
`

export default function SheetFormNew({ workbookId }: { workbookId: ObjectId }) {
    const [addSheet, {loading, error, reset }] = useAddSheetMutation({
        refetchQueries: ['GetSheets']
    });
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [schema, setSchema] = useState('')

    const canCreate = !loading && schema !== '' && name.trim() !== ''

    if (!open) return <div className="my-2">
        <Button onClick={() => setOpen(true)}>+ Nuovo foglio</Button>
    </div>

    return <form
        className="my-2 p-2 border inline-grid grid-cols-[auto_1fr] gap-2 items-center"
        onSubmit={e => { e.preventDefault(); if (canCreate) create() }}
    >
        <div className="col-span-2 font-bold">Nuovo foglio</div>
        <label htmlFor="new-sheet-name">Nome</label>
        <input
            id="new-sheet-name"
            className="p-1 border"
            autoFocus
            placeholder="es. Liceo Galilei - Pisa"
            value={name}
            onChange={e => setName(e.target.value)}
        />
        <label htmlFor="new-sheet-schema">Schema</label>
        <select id="new-sheet-schema" className="p-1 border" value={schema} onChange={e => setSchema(e.target.value)}>
            <option value="">Scegli uno schema</option>
            { Object.entries(schemas).map(([key, schema]) =>
                <option key={key} value={key}>{schema.header}</option>
            )}
        </select>
        <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>Annulla</Button>
            <Button type="submit" disabled={!canCreate}>Crea</Button>
        </div>
        { error && <div className="col-span-2"><Error error={error.message} /></div> }
    </form>

    async function create() {
        try {
            await addSheet({variables: {
                name: name.trim(),
                schema,
                workbookId,
                permissions: []
            }})
        } catch {
            return // the error is shown in the form
        }
        close()
    }

    function close() {
        setOpen(false)
        setName('')
        setSchema('')
        reset()
    }
}
