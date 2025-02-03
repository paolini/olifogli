import { NextRequest } from 'next/server'; // Usa i tipi corretti per Next.js 13+

export interface User {
  email: string;
  uid: string;
}

export type Context = {
  req: NextRequest
  res: Response|undefined
  user?: User
}
