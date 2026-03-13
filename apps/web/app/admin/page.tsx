import { AdminConsole } from "../../components/admin-console";
import { TopNav } from "../../components/top-nav";

export default function AdminPage() {
  return (
    <main className="world-admin app-shell lg:with-ai-rail">
      <TopNav />

      <section className="surface-stage mt-5 rounded-[1.8rem] p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-gold">Admin</p>
        <h1 className="mt-2 font-[var(--font-display)] text-5xl leading-[1.05] text-ink">Decision workspace for applications and member governance</h1>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          Review candidates with full context, decide quickly, manage members, and issue readable activation links in one premium control layer.
        </p>
      </section>

      <div className="mt-5">
        <AdminConsole />
      </div>
    </main>
  );
}
