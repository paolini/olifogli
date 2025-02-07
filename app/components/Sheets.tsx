import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import Loading from '@/app/components/Loading';
import Error from '@/app/components/Error';
import { Input } from '@/app/components/Input';
import { Sheet } from '@/lib/models';

type SheetWithId = Sheet & { _id: string };

const GET_SHEETS = gql`
    query GetSheets {
        sheets {
            _id
            name
            schema
            params
        }
    }
`;

const ADD_SHEET = gql`
    mutation AddSheet($name: String!, $schema: String!, $params: String!) {
        addSheet(name: $name, schema: $schema, params: $params) {
            _id
            name
            schema
            params
        }
    }
`;

const DELETE_SHEET = gql`
    mutation DeleteSheet($_id: ObjectId!) {
        deleteSheet(_id: $_id)
    }
`;

export default function Sheets({}) {
    return <div>
        <SheetsTable />
        <SheetForm />
    </div>;
}

function SheetsTable({}) {
    const { loading, error, data } = useQuery<{sheets: [SheetWithId]}>(GET_SHEETS);

    if (loading) return <Loading />;
    if (error) return <Error error={error} />;
    if (!data) return <div>No data</div>;
    const sheets = data.sheets;

    return <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Schema</th>
                <th>Params</th>
            </tr>
        </thead>
        <tbody>
            {sheets.map(sheet => <SheetRow key={sheet._id} sheet={sheet} />)}
        </tbody>
    </table>
}

function SheetRow({sheet}:{sheet:SheetWithId}) {
    const [deleteSheet, {loading, error}] = useMutation<{deleteSheet:string}>(DELETE_SHEET, {
        refetchQueries: [{query: GET_SHEETS}]
    });

    if (error) return <tr className="error"><td colSpan={99}>Errore: {error.message}</td></tr>;

    return <tr key={sheet._id}>
        <td>
            {sheet.name}
        </td>
        <td>
            {sheet.schema}
        </td>
        <td>
            {sheet.params}
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
    const [addSheet, {loading, error}] = useMutation<{addSheet:Sheet}>(ADD_SHEET, {
        refetchQueries: [{query: GET_SHEETS}]
    });
    const [name, setName] = useState('');

    return <div>
        <Input value={name} setValue={setName}/>
        <button disabled={loading} onClick={create}>Crea</button>
    </div>;

    async function create() {
        await addSheet({variables: {
            name,
            schema: "distrettuale",
            params: "{}"
        }});
        setName('');
    }
}