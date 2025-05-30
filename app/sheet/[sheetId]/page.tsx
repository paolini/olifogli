"use client"
import { gql, useQuery, TypedDocumentNode } from '@apollo/client'
import ApolloProviderClient from '@/app/ApolloProviderClient'
import { useParams } from 'next/navigation'

import { Sheet } from '@/app/lib/models'
import Loading from '@/app/components/Loading'
import Error from '@/app/components/Error'
import Table from '@/app/components/Table'
import CsvImport from '@/app/components/CsvImport'
import ScansImport from '@/app/components/ScansImport'
import NavBar from '@/app/components/NavBar'

const GET_SHEET: TypedDocumentNode<{sheet: Sheet & {_id: string}}> = gql`
    query getSheet($sheetId: ObjectId!) {
        sheet(sheetId: $sheetId) {
            _id
            name
            schema
        }
    }
`

export default function SheetPage() {
    const params = useParams<{ sheetId: string }>();
    const sheetId = params.sheetId;
    return <ApolloProviderClient>
        <NavBar />
        <SheetContent sheetId={sheetId}/>
    </ApolloProviderClient>
}

function SheetContent({sheetId}: {
    sheetId: string
}) {
    const { data, error } = useQuery(GET_SHEET, { variables: { sheetId } });
    if (error) return <Error error={error} />;
    if (!data) return <Loading />;

    const { sheet } = data

    return <>
            <h1>{sheet.name} [{sheet.schema}]</h1>
            <Table sheetId={sheet._id} schemaName={sheet.schema} />
            <CsvImport sheetId={sheet._id} schemaName={sheet.schema} />
            <ScansImport sheetId={sheet._id} />
        </>
}