import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

interface Data {
    [key: string]: any; // Definisci il tipo dei tuoi dati
}

export async function POST(req: NextRequest) {
    try {
        const client = await clientPromise;
        const db = client.db('olifogli');

        const data: Data = await req.json();
        const result = await db.collection('rows').insertOne(data);

        return NextResponse.json({ message: 'Data inserted', result }, { status: 201 });
    } catch (error) {
        console.error('Error inserting data:', error);
        return NextResponse.json({ error: 'Failed to insert data' }, { status: 500 });
    }
}
