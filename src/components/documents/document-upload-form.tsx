"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerUploadedDocument } from "@/lib/actions/documents";

type Option = { id: string; label: string };
type DocumentTypeOption = { id: string; name: string };

export function DocumentUploadForm({
  tenantId,
  clients,
  providers,
  organizations,
  documentTypes,
  fixedClientId,
  fixedProviderId,
  fixedOrganizationId,
  caseId,
  requirementId,
  defaultTitle,
}: {
  tenantId: string;
  clients: Option[];
  providers: Option[];
  organizations: Option[];
  documentTypes: DocumentTypeOption[];
  fixedClientId?: string | null;
  fixedProviderId?: string | null;
  fixedOrganizationId?: string | null;
  caseId?: string | null;
  requirementId?: string | null;
  defaultTitle?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const file = form.get("file");

    try {
      if (!(file instanceof File) || file.size <= 0) {
        throw new Error("Choose a file to upload.");
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error("File exceeds the 25 MB upload limit.");
      }

      const clientId = fixedClientId ?? String(form.get("client_id") || "");
      const providerId = fixedProviderId ?? String(form.get("provider_id") || "") || null;
      const organizationId =
        fixedOrganizationId ?? String(form.get("organization_id") || "") || null;
      const documentTypeId = String(form.get("document_type_id") || "");
      const title = String(form.get("title") || "").trim();

      if (!clientId || !documentTypeId || !title) {
        throw new Error("Client, document type, and title are required.");
      }

      const safeName =
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "document";
      const objectPath =
        tenantId +
        "/" +
        clientId +
        "/" +
        crypto.randomUUID() +
        "/" +
        crypto.randomUUID() +
        "-" +
        safeName;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("credentialing-documents")
        .upload(objectPath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
          cacheControl: "3600",
        });

      if (uploadError) throw new Error(uploadError.message);

      try {
        await registerUploadedDocument({
          objectPath,
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          clientId,
          providerId,
          organizationId,
          documentTypeId,
          title,
          issuedDate: String(form.get("issued_date") || "") || null,
          expirationDate: String(form.get("expiration_date") || "") || null,
          caseId: caseId ?? null,
          requirementId: requirementId ?? null,
        });
      } catch (error) {
        await supabase.storage.from("credentialing-documents").remove([objectPath]);
        throw error;
      }

      setMessage("Document uploaded successfully.");
      formRef.current?.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {!fixedClientId ? (
        <div>
          <label className="tba-label">Client</label>
          <select name="client_id" className="tba-input" defaultValue="" required>
            <option value="" disabled>Select client</option>
            {clients.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      {!fixedProviderId ? (
        <div>
          <label className="tba-label">Provider</label>
          <select name="provider_id" className="tba-input" defaultValue="">
            <option value="">No provider selected</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      {!fixedOrganizationId ? (
        <div>
          <label className="tba-label">Organization</label>
          <select name="organization_id" className="tba-input" defaultValue="">
            <option value="">No organization selected</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="tba-label">Document type</label>
        <select name="document_type_id" className="tba-input" defaultValue="" required>
          <option value="" disabled>Select type</option>
          {documentTypes.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <label className="tba-label">Title</label>
        <input
          name="title"
          className="tba-input"
          defaultValue={defaultTitle ?? ""}
          required
        />
      </div>

      <div>
        <label className="tba-label">Issued date</label>
        <input name="issued_date" type="date" className="tba-input" />
      </div>

      <div>
        <label className="tba-label">Expiration date</label>
        <input name="expiration_date" type="date" className="tba-input" />
      </div>

      <div className="md:col-span-2 xl:col-span-4">
        <label className="tba-label">File</label>
        <input
          name="file"
          type="file"
          className="tba-input"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt"
          required
        />
      </div>

      <div className="md:col-span-2 xl:col-span-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#175cd3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1849a9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Uploading..." : caseId ? "Upload + attach" : "Upload document"}
        </button>
        {message ? <span className="text-sm text-[#667085]">{message}</span> : null}
      </div>
    </form>
  );
}
