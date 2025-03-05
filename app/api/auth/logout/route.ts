import { NextRequest, NextResponse } from "next/server";
import { serialize } from "cookie";
import { myAbsoluteUrl } from "../callback/route";

export async function GET(req: NextRequest) {
    // clear the auth_token cookie
    const cookie = serialize("session" /* "auth_token" */, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: -1,
        path: "/",
    })
    const nextParam = req.nextUrl.searchParams.get("next");
    const redirectTo = nextParam?.startsWith('/') ? nextParam : "/";
    const redirectUrl = myAbsoluteUrl(req, redirectTo);
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set("Set-Cookie", cookie);
    return response;
}