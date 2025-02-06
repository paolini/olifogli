import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+
import { ObjectId } from 'mongodb';

export type Context = {
  req: NextRequest
  res: Response|undefined
  user_id?: ObjectId
}
