import { NextResponse } from "next/server";
import { signupUser, loginUser, AUTH_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { acceptInvite, createHouseholdFor, AuthError } from "@/lib/household";
import { recordSignupConsents, type Purpose } from "@/lib/consent";

export const runtime = "nodejs";

// Sign-up now also gives the account somewhere to live.
//
// Previously it created an app_users row and stopped — the account belonged to
// no household, so the app fell back to showing everyone the same demo tenant.
// Now: with an invite code you join that household; without one you get your own,
// seeded with the 3-bucket model so the dashboard has something to render.
export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
    name?: string;
    inviteCode?: string;
    // The optional purposes, as answered on the form. Absent means "no" — this
    // is opt-in, so a client that forgets to send the field cannot accidentally
    // grant anything. See lib/consent.ts.
    consents?: Partial<Record<Purpose, boolean>>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    await signupUser(email, password, body.name ?? "");
    const { token, user } = await loginUser(email, password);

    // Consent is written against the household the account ends up in, so it is
    // recorded after that is settled rather than at the top — a consent row
    // pointing at no tenant is an audit trail that cannot answer "whose data".
    const consent = async (tenantId: string) => {
      try {
        await recordSignupConsents({ userId: user.id, tenantId, answers: body.consents ?? {} });
      } catch {
        // Never fail a sign-up over the audit write. The account exists and the
        // required purposes are a term of having one; a missing row is a gap in
        // evidence, not a licence to process the optional purposes, because
        // every reader treats "no row" as "no".
      }
    };

    let joined: string | null = null;
    if (body.inviteCode?.trim()) {
      try {
        const tenant = await acceptInvite(user, body.inviteCode);
        joined = tenant.name;
        await consent(tenant.id);
      } catch (err) {
        // The account exists now — refusing the whole sign-up over a bad code
        // would strand them with no household at all. Give them their own and
        // say what happened; they can redeem a fresh code from /join.
        const own = await createHouseholdFor(user);
        await consent(own.tenant.id);
        const why = err instanceof AuthError ? err.message : "That invite code could not be used.";
        const res = NextResponse.json({
          ok: true,
          role: user.role,
          warning: `${why} We've started a household for you instead — you can join theirs later from Household → Join.`,
        });
        setAuthCookie(res, token);
        return res;
      }
    } else {
      const own = await createHouseholdFor(user);
      await consent(own.tenant.id);
    }

    const res = NextResponse.json({ ok: true, role: user.role, joined });
    setAuthCookie(res, token);
    return res;
  } catch (err) {
    let message = err instanceof Error ? err.message : "Sign-up failed";
    if (/validation_not_unique|already exists|unique/i.test(message)) {
      message = "That email is already registered — try logging in.";
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function setAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}
