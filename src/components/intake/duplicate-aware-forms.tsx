"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createClientRecord, createOrganizationRecord, type CreationFeedback } from "@/lib/actions/intake";
import { matchingClient, matchingOrganization, type ExistingClient, type ExistingOrganization } from "@/lib/record-duplicates";

const initial: CreationFeedback = { status: "idle", message: "" };

export function CreateClientForm({ existing }: { existing: ExistingClient[] }) {
  const [state, action] = useActionState(createClientRecord, initial);
  const [name, setName] = useState("");
  const match = matchingClient(existing, name);
  return <form action={action} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    <div className="xl:col-span-2">
      <label htmlFor="new-client-name" className="tba-label">Client name</label>
      <input id="new-client-name" name="name" className="tba-input" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} aria-describedby={match ? "client-duplicate" : undefined} />
      {match && <p id="client-duplicate" role="alert" className="mt-2 text-sm text-[#b42318]">Client already exists: <Link href={`/clients/${match.id}`} className="underline">{match.name} — open record</Link></p>}
    </div>
    <div><label className="tba-label">Client type</label><select name="client_type" className="tba-input" defaultValue="group">{["individual","group","company","facility","other"].map(type=><option key={type} value={type}>{type}</option>)}</select></div>
    <div><label className="tba-label">Primary contact</label><input name="primary_contact_name" className="tba-input" /></div>
    <div><label className="tba-label">Contact email</label><input type="email" name="primary_contact_email" className="tba-input" /></div>
    <div><label className="tba-label">Contact phone</label><input name="primary_contact_phone" className="tba-input" /></div>
    {state.status !== "idle" && <p role="status" className={`text-sm md:col-span-2 xl:col-span-5 ${state.status === "error" ? "text-[#b42318]" : "text-[#067647]"}`}>{state.message} {state.recordId && <Link href={`/clients/${state.recordId}`} className="underline">Open client</Link>}</p>}
    <div className="md:col-span-2 xl:col-span-5"><SubmitButton disabled={Boolean(match)} idleLabel="Create client" pendingLabel="Creating client..." /></div>
  </form>;
}

export function CreateOrganizationForm({ existing, clients }: {
  existing: ExistingOrganization[];
  clients: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(createOrganizationRecord, initial);
  const [name, setName] = useState("");
  const [npi, setNpi] = useState("");
  const match = matchingOrganization(existing, name, npi);
  return <form action={action} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    <div className="xl:col-span-2">
      <label htmlFor="org-legal-name" className="tba-label">Legal name</label>
      <input id="org-legal-name" name="legal_name" className="tba-input" required maxLength={250} value={name} onChange={event=>setName(event.target.value)} aria-describedby={match ? "org-duplicate" : undefined} />
      {match && <p id="org-duplicate" role="alert" className="mt-2 text-sm text-[#b42318]">{match.reason === "npi" ? "NPI already exists" : "Organization name already exists"}: {match.record.legal_name}. Use the existing record instead.</p>}
    </div>
    <div><label className="tba-label">DBA</label><input name="dba_name" className="tba-input" /></div>
    <div><label className="tba-label">Organization type</label><input name="organization_type" className="tba-input" placeholder="Group, Home Health..." /></div>
    <div><label htmlFor="org-npi" className="tba-label">Entity NPI</label><input id="org-npi" name="entity_npi" className="tba-input" inputMode="numeric" pattern="[0-9]{10}" value={npi} onChange={event=>setNpi(event.target.value)} /></div>
    <div className="xl:col-span-2"><label className="tba-label">Client</label><select name="client_id" className="tba-input" defaultValue=""><option value="">No client selected</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
    {state.status !== "idle" && <p role="status" className={`text-sm md:col-span-2 xl:col-span-5 ${state.status === "error" ? "text-[#b42318]" : "text-[#067647]"}`}>{state.message}</p>}
    <div className="md:col-span-2 xl:col-span-5"><SubmitButton disabled={Boolean(match)} idleLabel="Create organization" pendingLabel="Creating organization..." /></div>
  </form>;
}
