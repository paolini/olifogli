import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export async function context({ req }: { req: NextRequest }) {
  const authHeader = req.headers.get("authorization");
  let user = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      user = jwt.verify(token, process.env.JWT_SECRET!);
    } catch (err) {
      console.error("Invalid token", err);
    }
  }

  return { user };
}
