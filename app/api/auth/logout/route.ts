import { NextRequest, NextResponse } from "next/server";
import { serialize } from "cookie";

export async function GET(req: NextRequest) {
    // clear the auth_token cookie
    const cookie = serialize("auth_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: -1,
        path: "/",
    })
    const redirectTo = req.nextUrl.searchParams.get("next") || "/";
    const response = NextResponse.redirect(new URL(redirectTo, req.url));
    response.headers.set("Set-Cookie", cookie);
    return response;
}