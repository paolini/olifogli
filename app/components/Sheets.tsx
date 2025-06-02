import { useState } from 'react';
import { useSession } from "next-auth/react"
import { gql, useQuery, useMutation } from '@apollo/client';
import Loading from '@/app/components/Loading';
import Error from '@/app/components/Error';
import { Input } from '@/app/components/Input';
import { Sheet } from '@/app/lib/models';
import { WithId } from 'mongodb';
import useProfile from '../lib/useProfile';

const GET_SHEETS = gql`
    query GetSheets {
        sheets {
            _id
            name
            schema
        }
    }
`;

const ADD_SHEET = gql`
    mutation AddSheet($name: String!, $schema: String!) {
        addSheet(name: $name, schema: $schema) {
            _id
            name
            schema
        }
    }
`;

const DELETE_SHEET = gql`
    mutation DeleteSheet($_id: ObjectId!) {
        deleteSheet(_id: $_id)
    }
`;

export default function Sheets({}) {
    const profile = useProfile()
    return <div>
        <h1>Fogli</h1>
        {profile && <SheetsTable />}
        {profile?.is_admin && <SheetForm />}
    </div>;
}

function SheetsTable({}) {
    const { loading, error, data } = useQuery<{sheets: WithId<Sheet>[]}>(GET_SHEETS);

    if (loading) return <Loading />;
    if (error) return <Error error={error} />;
    if (!data) return <div>No data</div>;
    const sheets = data.sheets;

    if (sheets.length === 0) return <div className="bg-alert">Nessun foglio disponibile</div>

    return <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Schema</th>
            </tr>
        </thead>
        <tbody>
            {sheets.map(sheet => <SheetRow key={sheet._id.toString()} sheet={sheet} />)}
        </tbody>
    </table>
}

function SheetRow({sheet}:{sheet:WithId<Sheet>}) {
    const [deleteSheet, {loading, error}] = useMutation<{deleteSheet:string}>(DELETE_SHEET, {
        refetchQueries: [{query: GET_SHEETS}]
    });

    if (error) return <tr className="error"><td colSpan={99}>Errore: {error.message}</td></tr>;

    return <tr key={sheet._id.toString()}>
        <td>
            <a href={`/sheet/${sheet._id}`}>{sheet.name}</a>
        </td>
        <td>
            {sheet.schema}
        </td>
        <td>
            <button disabled={loading} onClick={doDelete}>Elimina</button>
        </td>
    </tr>

    async function doDelete() {
        await deleteSheet({variables: {_id: sheet._id}});
    }
}

function SheetForm({}) {
    const [addSheet, {loading, error, reset }] = useMutation<{addSheet:Sheet}>(ADD_SHEET, {
        refetchQueries: [{query: GET_SHEETS}]
    });
    const [name, setName] = useState('')
    const [schema, setSchema] = useState('')

    if (error) return <Error error={error} dismiss={reset}/>;

    return <div>
        <select name="schema" value={schema} onChange={e => setSchema(e.target.value)}>
            <option value="">Scegli uno schema</option>
            <option value="distrettuale">Distrettuale</option>
            <option value="archimede">Archimede</option>
            <option value="ammissioneSenior">Ammissione Senior</option>
        </select>
        <Input value={name} setValue={setName}/>
        <button disabled={loading||schema==""||name==""} onClick={create}>Crea</button>
    </div>;

    async function create() {
        await addSheet({variables: {
            name,
            schema: schema,
        }});
        setName('');
        setSchema('');
    }
}