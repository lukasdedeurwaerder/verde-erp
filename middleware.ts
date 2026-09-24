import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

// Draait bij élk verzoek. Doet twee dingen:
//
// 1. De sessie verversen, zodat een student niet elk lesuur opnieuw
//    hoeft in te loggen.
// 2. Wie niet ingelogd is naar /login sturen.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() controleert het token bij Supabase zelf. Niet vervangen
  // door getSession(): dat leest alleen de cookie en is dus te
  // vertrouwen door wie de cookie kan vervalsen.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pad = request.nextUrl.pathname;
  const isLoginPagina = pad === "/login";

  if (!user && !isLoginPagina) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPagina) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Alles behalve statische bestanden en de iconen.
    "/((?!_next/static|_next/image|favicon.ico|icon\\.svg|icon.*\\.png|apple-icon.*\\.png).*)",
  ],
};
