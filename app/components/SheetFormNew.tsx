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
    const [addSheet, {loading, error }] = useAddSheetMutation({
        refetchQueries: ['GetSheets']
    });
    const [name, setName] = useState('')
    const [schema, setSchema] = useState('')

    if (error) return <Error error={error.message} />;

    return <div>
        <select name="schema" value={schema} onChange={e => setSchema(e.target.value)}>
            <option value="">Scegli uno schema</option>
            { Object.entries(schemas).map(([key, schema]) =>
                <option key={key} value={key}>{schema.header}</option>
            )}
        </select> {}
        <input value={name} onChange={e => setName(e.target.value)} /> {}
        <Button disabled={loading||schema==""||name==""} onClick={create}>
            ⚙ Nuovo foglio
        </Button>
    </div>

    async function create() {
        await addSheet({variables: {
            name,
            schema: schema,
            workbookId,
            permissions: []
        }})
        setName('')
        setSchema('')
    }
}
