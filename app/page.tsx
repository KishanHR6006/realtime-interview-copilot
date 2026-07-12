export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Meeting Coach backend</h1>
      <p className="max-w-md text-sm text-gray-500">
        This service only hosts the API used by the Meeting Coach Chrome extension
        (/api/completion and /api/deepgram). There is no web UI here.
      </p>
    </main>
  );
}
