import Table from '@/app/components/Table';
import { ObjectId } from 'mongodb';
import { getSheetsCollection } from '@/app/lib/models';
import ApolloProviderClient from '@/app/ApolloProviderClient'; // Modifica il percorso se necessario

export default async function SheetPage({ params }:{params: Promise<{sheetId: string}>}) {
    const sheetId = (await params).sheetId;
    const sheetsCollection = await getSheetsCollection();
    const sheet = await (sheetsCollection.findOne({_id: new ObjectId(sheetId)}));    
    if (!sheet) return <div>Sheet not found</div>;
    return <ApolloProviderClient> 
        <h1>{sheet.name} [{sheet.schema}]</h1>
        <Table sheetId={sheet._id.toString()} schemaName={sheet.schema} />
    </ApolloProviderClient>
}