import ResetForm from "./ResetForm";

// Server component: reads ?token= here and hands it down, so the form is in
// the server-rendered HTML. See ResetForm.tsx for why that matters.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.token;
  const token = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <ResetForm token={token} />
    </main>
  );
}
