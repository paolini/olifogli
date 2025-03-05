import { NextRequest, NextResponse } from "next/server";
import { serialize } from "cookie";
import jwt from "jsonwebtoken";

import {getDb} from "@/app/lib/mongodb"
import {User} from "@/app/lib/models";
import {myAbsoluteUrl} from "../util";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  const OLIMANAGER_PUBLIC_KEY = process.env.OLIMANAGER_PUBLIC_KEY;
  if (!OLIMANAGER_PUBLIC_KEY) return NextResponse.json({ error: "Chiave pubblica OLIMANAGER_PUBLIC_KEY mancante" }, { status: 500 });
  jwt.verify(token, OLIMANAGER_PUBLIC_KEY, { algorithms: ['RS256'] });
  const decoded = jwt.decode(token) as {uid: string};
  const {uid} = decoded;
  
  const userId = await getUserFromUid(uid)

  const session = { userId }

  // Crea il cookie della sessione
  const cookie = serialize("session", JSON.stringify(session), {
    httpOnly: true, // Sicurezza: accessibile solo dal server
    secure: process.env.NODE_ENV === "production", // Solo in HTTPS in produzione
    maxAge: 3600, // Scade dopo un'ora
    path: "/", // Valido per tutte le rotte
  });

  const nextParam = url.searchParams.get("next");
  const redirectTo = nextParam?.startsWith('/') ? nextParam : "/";

  const redirectUrl = myAbsoluteUrl(req, redirectTo);
  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Set-Cookie", cookie); // Imposta il cookie nella risposta

  return response;
}

async function getUserFromUid(uid:string) {
  const db = await getDb()
  const user = await db.collection<User>('users').findOne({uid})
  if (user!==null) return user._id
  // create new user with given uid
  const response = await db.collection('users').insertOne({uid, name: `utente ${uid}`})
  return response.insertedId
}