"use client";

import { useConfig } from "@/app/components/ConfigProvider";

export default function ClientEnv() {
  const config = useConfig();
  
  const clientEnv = {
     NEXT_PUBLIC_SERVER_NAME: process.env.NEXT_PUBLIC_SERVER_NAME,
     NEXT_PUBLIC_APP_INSTANCE: process.env.NEXT_PUBLIC_APP_INSTANCE,
  };

  return (
    <div className="border p-4 rounded bg-white shadow text-black">
        <h2 className="text-xl font-bold mb-4">Client Side Context (useConfig)</h2>
        <p className="mb-2">Valori ricevuti dal ConfigProvider:</p>
        <pre className="bg-blue-100 p-4 rounded overflow-auto border mb-4">
          {JSON.stringify(config, null, 2)}
        </pre>

        <h2 className="text-xl font-bold mb-4">Client Side process.env</h2>
        <p className="mb-2">Valori &quot;hardcoded&quot; da Next.js durante la build:</p>
        <pre className="bg-green-100 p-4 rounded overflow-auto border">
          {JSON.stringify(clientEnv, null, 2)}
        </pre>
    </div>
  );
}
