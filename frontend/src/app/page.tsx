"use client";

import { useState } from "react";
import { getServiceAgreement } from "@/lib/contract";

export default function Home() {
  const [account, setAccount] = useState<string>();
  const [count, setCount] = useState<string>();
  const [error, setError] = useState<string>();

  async function connect() {
    try {
      setError(undefined);
      const { contract, address } = await getServiceAgreement();
      setAccount(address);
      setCount((await contract.agreementCount()).toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>FreeLance Chain</h1>
      <p>Contrats numeriques entre freelances et clients, enregistres sur la blockchain.</p>
      <button onClick={connect}>Connecter MetaMask</button>
      {account && <p>Compte : {account}</p>}
      {count !== undefined && <p>Accords enregistres : {count}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
