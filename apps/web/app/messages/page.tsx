import { Suspense } from "react";
import { MemberMessages } from "../../components/member-messages";
import { TopNav } from "../../components/top-nav";

export default function MessagesPage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <div className="mt-4">
        <Suspense
          fallback={
            <section className="surface-stage rounded-[1.8rem] p-8 text-center">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading conversations…</p>
            </section>
          }
        >
          <MemberMessages />
        </Suspense>
      </div>
    </main>
  );
}
