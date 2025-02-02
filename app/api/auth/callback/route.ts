import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { env } from "process";

const PUBLIC_KEY = env.OLIMANAGER_PUBLIC_KEY;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!PUBLIC_KEY) return NextResponse.json({ error: "Chiave pubblica non impostata" }, { status: 500 });

  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  try {
    // Verifica il token JWT
    const decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ["RS256"] });

    // Salva l'utente in una sessione (per ora lo restituiamo come JSON)
    return NextResponse.json({ user: decoded });
  } catch (error) {
    return NextResponse.json({ error: "Token non valido" }, { status: 401 });
  }
}
