import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DocumentOpenButton } from "@/components/documents/document-open-button";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership) {
    throw new Error("No active tenant membership is available.");
  }

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

  const clientOptions = (clients ?? []).map((client) => ({
    id: client.id,
    label: client.name,
  }));

  const providerOptions = (providers ?? []).map((provider) => ({
    id: provider.id,
    label: [provider.first_name, provider.last_name].filter(Boolean).join(" "),
  }));

  const organizationOptions = (organizations ?? []).map((organization) => ({
    id: organization.id,
    label: organization.legal_name,
  }));

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
          Files upload directly from your signed-in browser to the private repository. Maximum size: 25 MB.
        </p>

        <div className="mt-5">
          <DocumentUploadForm
            tenantId={membership.tenant_id}
            clients={clientOptions}
            providers={providerOptions}
            organizations={organizationOptions}
            documentTypes={(documentTypes ?? []).map((type) => ({
              id: type.id,
              name: type.name,
            }))}
          />
        </div>
      </section>

      <div className="tba-card overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1.1fr_1fr_1fr_120px] border-b border-[#eaecf0] bg-[#f9fafb] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <span>Document</span>
          <span>Owner</span>
          <span>Type</span>
          <span>Expiration</span>
          <span>File</span>
        </div>

        {(documents ?? []).length ? documents!.map((document: any) => (
          <div
            key={document.id}
            className="grid grid-cols-[1.5fr_1.1fr_1fr_1fr_120px] border-b border-[#f2f4f7] px-5 py-4 text-sm last:border-0"
          >
            <div>
              <p className="font-medium text-[#101828]">{document.title}</p>
              <p className="mt-1 text-xs capitalize text-[#667085]">
                {document.status.replaceAll("_", " ")}
              </p>
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
              {document.external_file_id &&
              document.storage_connections?.provider === "supabase_storage" ? (
                <DocumentOpenButton objectPath={document.external_file_id} />
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
