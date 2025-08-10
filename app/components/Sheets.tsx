import { useState } from 'react';
import { ObjectId } from 'bson';

import Button from './Button'
import Loading from '@/app/components/Loading';
import Error from '@/app/components/Error';
import { Input } from '@/app/components/Input';
import useProfile from '../lib/useProfile';
import { schemas } from '../lib/schema';
import { gql } from '@apollo/client';
import { useGetSheetsQuery, useAddSheetMutation, Sheet } from '../graphql/generated';

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
gql`
    query GetSheets($workbookId: ObjectId!) {
        sheets(workbookId: $workbookId) {
            _id
            name
            schema
        }
    }
`

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!) {
        addSheet(name: $name, schema: $schema, workbookId: $workbookId) {
            _id
            name
            schema
        }
    }
`

export default function Sheets({ workbookId }: { workbookId: ObjectId }) {
    const profile = useProfile()
    return <div className="p-4">
        <h1>Fogli</h1>
        {profile && <SheetsTable workbookId={workbookId} />}
        {profile?.is_admin && <SheetForm workbookId={workbookId} />}
    </div>;
}

function SheetsTable({ workbookId }: { workbookId: ObjectId }) {
    const { loading, error, data } = useGetSheetsQuery({
        variables: { workbookId }
    });

    if (loading) return <Loading />;
    if (error) return <Error error={error.message} />;
    if (!data) return <div>No data</div>;
    const sheets = data.sheets ?? [];

    if (sheets.length === 0) return <div className="bg-alert">Nessun foglio disponibile</div>

    return <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Schema</th>
            </tr>
        </thead>
        <tbody>
            {sheets.map(sheet => (
                sheet && (
                    <SheetRow key={sheet._id?.toString()} sheet={sheet} />
                )
            ))}
        </tbody>
    </table>
}

function SheetRow({sheet}: {sheet: Sheet}) {
    return <tr key={sheet._id?.toString()}>
        <td>
            <a href={`/sheet/${sheet._id}`}>{sheet.name}</a>
        </td>
        <td>
            {sheet.schema && schemas[sheet.schema].header}
        </td>
    </tr>
}

function SheetForm({ workbookId }: { workbookId: ObjectId }) {
    const [addSheet, {loading, error, reset }] = useAddSheetMutation({
        refetchQueries: ['GetSheets']
    });
    const [name, setName] = useState('')
    const [schema, setSchema] = useState('')

    if (error) return <Error error={error.message} dismiss={reset}/>;

    return <div>
        <select name="schema" value={schema} onChange={e => setSchema(e.target.value)}>
            <option value="">Scegli uno schema</option>
            { Object.entries(schemas).map(([key, schema]) =>
                <option key={key} value={key}>{schema.header}</option>
            )}
        </select> {}
        <Input value={name} setValue={setName}/> {}
        <Button disabled={loading||schema==""||name==""} onClick={create}>
            Nuovo foglio
        </Button>
    </div>

    async function create() {
        await addSheet({variables: {
            name,
            schema: schema,
            workbookId,
        }});
        setName('');
        setSchema('');
    }
}