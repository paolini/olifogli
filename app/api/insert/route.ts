import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

interface Data {
    cognome: string;
    nome: string;
    risposte: string;
}

export async function POST(req: NextRequest) {
    try {
        const db = await getDb();

        const data: Data = await req.json();
        const result = await db.collection('rows').insertOne(data);

        return NextResponse.json({ message: 'Data inserted', result }, { status: 201 });
    } catch (error) {
        console.error('Error inserting data:', error);
        return NextResponse.json({ error: 'Failed to insert data' }, { status: 500 });
    }
}
