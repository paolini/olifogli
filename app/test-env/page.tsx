import ClientEnv from "./ClientEnv";

export const dynamic = 'force-dynamic'; // Assicuriamoci che questa pagina non venga cachata staticamente

export default function TestEnvPage() {
  const serverEnv = {
    SERVER_NAME: process.env.SERVER_NAME,
    NEXT_PUBLIC_SERVER_NAME: process.env.NEXT_PUBLIC_SERVER_NAME,
    APP_INSTANCE: process.env.APP_INSTANCE,
    NEXT_PUBLIC_APP_INSTANCE: process.env.NEXT_PUBLIC_APP_INSTANCE,
    // Verifichiamo anche NODE_ENV
    NODE_ENV: process.env.NODE_ENV,
  };

  return (
    <div className="p-10 font-mono text-sm max-w-4xl mx-auto space-y-8 bg-gray-50 min-h-screen text-black">
      <div className="border p-4 rounded bg-white shadow">
        <h1 className="text-xl font-bold mb-4">Server Side Variables</h1>
        <p className="mb-2">Questi valori sono letti a <strong>runtime</strong> nel container:</p>
        <pre className="bg-gray-100 p-4 rounded overflow-auto border">
          {JSON.stringify(serverEnv, null, 2)}
        </pre>
      </div>
      
      <ClientEnv />
    </div>
  );
}
