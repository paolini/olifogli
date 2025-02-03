import { NextRequest, NextResponse } from "next/server";
import { serialize } from "cookie";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  // Crea il cookie della sessione
  const cookie = serialize("auth_token", token, {
    httpOnly: true, // Sicurezza: accessibile solo dal server
    secure: process.env.NODE_ENV === "production", // Solo in HTTPS in produzione
    maxAge: 3600, // Scade dopo un'ora
    path: "/", // Valido per tutte le rotte
  });

  // Ottieni l'URL di redirect (o la home page se non specificato)
  const redirectTo = url.searchParams.get("next") || "/";
  
  // Crea la risposta di redirect e aggiungi il cookie
  const response = NextResponse.redirect(new URL(redirectTo, req.url));
  response.headers.set("Set-Cookie", cookie); // Imposta il cookie nella risposta

  return response;
}