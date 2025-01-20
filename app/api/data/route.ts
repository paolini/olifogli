import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(req: NextRequest) {
    try {
        const db = await getDb();

        const collection = db.collection('rows');
        const data = await collection.find({}).toArray();

        return NextResponse.json({data});
    } catch (error) {
        console.error('Error getting data:', error);
        return NextResponse.json({ error: 'Failed to get data data' }, { status: 500 });
    }
}
