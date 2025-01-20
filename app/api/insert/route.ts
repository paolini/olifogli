import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { Row } from '@/lib/answers';

export async function POST(req: NextRequest) {
    try {
        const db = await getDb();

        const row: Row = await req.json();
        const result = await db.collection('rows').insertOne(row);

        return NextResponse.json({ message: 'Data inserted', result }, { status: 201 });
    } catch (error) {
        console.error('Error inserting data:', error);
        return NextResponse.json({ error: 'Failed to insert data' }, { status: 500 });
    }
}
