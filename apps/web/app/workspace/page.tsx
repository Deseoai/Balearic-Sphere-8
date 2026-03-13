import { MemberWorkspace } from "../../components/member-workspace";
import { TopNav } from "../../components/top-nav";

export default function WorkspacePage() {
  return (
    <main className="world-member app-shell lg:with-ai-rail">
      <TopNav />
      <MemberWorkspace />
    </main>
  );
}
