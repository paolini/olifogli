import { NextRequest } from "next/server";

export function myAbsoluteUrl(req: NextRequest, path: string) {
  // Usa l'host corretto
  const host = req.headers.get("host"); 
  const protocol = req.nextUrl.protocol || "https:"; 
  const url = new URL(path, `${protocol}//${host}`);
  return url
}

