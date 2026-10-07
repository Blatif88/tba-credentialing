import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { uploadDocument } from "@/lib/actions/documents";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const [
    { data: documents },
    { data: documentTypes },
    { data: clients },
    { data: providers },
    { data: organizations },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id,title,status,issued_date,expiration_date,external_file_id,created_at,document_types(name,code),clients(name),providers(first_name,last_name),organizations(legal_name),storage_connections(provider)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_types")
      .select("id,name,code,category,subject_type,expirable")
      .eq("active", true)
      .order("name"),
    supabase.from("clients").select("id,name").is("archived_at", null).order("name"),
    supabase.from("providers").select("id,client_id,first_name,last_name").is("archived_at", null).order("last_name"),
    supabase.from("organizations").select("id,client_id,legal_name").is("archived_at", null).order("legal_name"),
  ]);

  const rows = await Promise.all(
    (documents ?? []).map(async (document: any) => {
      let signedUrl: string | null = null;

      if (
        document.external_file_id &&
        document.storage_connections?.provider === "supabase_storage"
      ) {
        const { data } = await supabase.storage
          .from("credentialing-documents")
          .createSignedUrl(document.external_file_id, 300);

        signedUrl = data?.signedUrl ?? null;
      }

      return { ...document, signedUrl };
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Documents"
        description="Private credentialing document repository with versions, expiration dates, and requirement reuse."
      />

      <section className="tba-card mb-6 p-6">
        <h2 className="text-lg font-semibold">Upload document</h2>
        <p className="mt-1 text-sm text-[#667085]">
          Files are stored in the private internal repository. Maximum size: 25 MB.
        </p>

        <form action={uploadDocument} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="tba-label">Client</label>
            <select name="client_id" className="tba-input" defaultValue="" required>
              <option value="" disabled>Select client</option>
              {(clients ?? []).map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">Provider</label>
            <select name="provider_id" className="tba-input" defaultValue="">
              <option value="">No provider selected</option>
              {(providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.first_name} {provider.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">Organization</label>
            <select name="organization_id" className="tba-input" defaultValue="">
              <option value="">No organization selected</option>
              {(organizations ?? []).map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.legal_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="tba-label">Document type</label>
            <select name="document_type_id" className="tba-input" defaultValue="" required>
              <option value="" disabled>Select type</option>
              {(documentTypes ?? []).map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="tba-label">Title</label>
            <input name="title" className="tba-input" required placeholder="NJ license, W-9, malpractice certificate..." />
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

          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton idleLabel="Upload document" pendingLabel="Uploading..." />
          </div>
        </form>
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1.1fr_1fr_1fr_120px] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Document</span>
          <span>Owner</span>
          <span>Type</span>
          <span>Expiration</span>
          <span>File</span>
        </div>

        {rows.length ? rows.map((document: any) => (
          <div
            key={document.id}
            className="grid grid-cols-[1.5fr_1.1fr_1fr_1fr_120px] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0"
          >
            <div>
              <p className="font-medium text-[#101828]">{document.title}</p>
              <p className="mt-1 text-xs capitalize text-[#667085]">{document.status.replaceAll("_", " ")}</p>
            </div>
            <span className="text-[#475467]">
              {document.providers
                ? document.providers.first_name + " " + document.providers.last_name
                : document.organizations?.legal_name ?? document.clients?.name ?? "—"}
            </span>
            <span className="text-[#475467]">{document.document_types?.name ?? "—"}</span>
            <span className="text-[#475467]">
              {document.expiration_date
                ? new Date(document.expiration_date + "T00:00:00").toLocaleDateString()
                : "—"}
            </span>
            <span>
              {document.signedUrl ? (
                <a
                  href={document.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#175cd3] underline"
                >
                  Open
                </a>
              ) : (
                <span className="text-[#98a2b3]">Unavailable</span>
              )}
            </span>
          </div>
        )) : (
          <div className="px-5 py-10 text-center text-sm text-[#667085]">
            No documents uploaded yet.
          </div>
        )}
      </div>
    </>
  );
}
