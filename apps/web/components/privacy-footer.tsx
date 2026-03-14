const G = {
  gold: "var(--gold)",
  champagne: "var(--champagne)",
  muted: "var(--text-secondary)",
  display: "var(--font-display)",
};

export function PrivacyFooter() {
  return (
    <footer
      id="data-protection"
      className="mt-16 border-t"
      style={{ borderColor: "rgba(196,151,58,0.10)", background: "rgba(12,11,9,0.80)" }}
    >
      <div className="app-shell py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-3">

          {/* Brand */}
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: G.champagne, fontFamily: G.display, fontSize: "1.1rem" }}>
              Balea Sphere
            </p>
            <p className="text-xs leading-relaxed" style={{ color: G.muted }}>
              A curated private members network for founders, investors, and ecosystem builders across Mallorca, Ibiza, and Menorca.
            </p>
            <p className="mt-3 text-[11px]" style={{ color: "rgba(154,144,128,0.55)" }}>
              © {new Date().getFullYear()} Balea Sphere. All rights reserved.
            </p>
          </div>

          {/* Data Protection */}
          <div className="lg:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: G.gold }}>
              Privacy &amp; Data Protection
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs leading-relaxed" style={{ color: G.muted }}>
              <div>
                <p className="font-medium mb-1" style={{ color: G.champagne }}>Data Controller</p>
                <p>
                  Balea Sphere operates as the data controller for all personal data collected through this platform.
                  Personal data is processed exclusively for membership administration, identity verification, and network facilitation.
                </p>
              </div>
              <div>
                <p className="font-medium mb-1" style={{ color: G.champagne }}>Legal Basis (GDPR Art. 6)</p>
                <p>
                  Data processing is based on your explicit consent (Art. 6(1)(a)) and the performance of a membership contract (Art. 6(1)(b)).
                  You may withdraw consent at any time without affecting prior processing.
                </p>
              </div>
              <div>
                <p className="font-medium mb-1" style={{ color: G.champagne }}>Data You Provide</p>
                <p>
                  We collect: name, email address, company, professional background, annual revenue range, website, social profiles,
                  application answers, profile photo, and platform activity. Revenue figures are strictly confidential and never shared with other members.
                </p>
              </div>
              <div>
                <p className="font-medium mb-1" style={{ color: G.champagne }}>Your Rights (GDPR Art. 15–22)</p>
                <p>
                  You have the right to access, rectify, erase, restrict, and port your personal data.
                  You may delete your account at any time via <a href="/settings" className="underline" style={{ color: G.gold }}>Settings → Data &amp; Privacy</a>.
                  For other requests, contact{" "}
                  <a href="mailto:privacy@balea-sphere8.com" className="underline" style={{ color: G.gold }}>privacy@balea-sphere8.com</a>.
                </p>
              </div>
              <div>
                <p className="font-medium mb-1" style={{ color: G.champagne }}>Data Retention</p>
                <p>
                  Active member data is retained for the duration of membership. Upon account deletion, all personal data is permanently removed from our systems.
                  An anonymised audit record of the deletion is retained to fulfil legal obligations under GDPR Art. 17(3).
                </p>
              </div>
              <div>
                <p className="font-medium mb-1" style={{ color: G.champagne }}>Third Parties &amp; Data Transfers</p>
                <p>
                  We use Notion for internal curation records (access-restricted to the admin team), n8n for workflow automation,
                  and Stripe for payment processing (PCI-DSS compliant). No personal data is sold or shared with third parties for marketing.
                </p>
              </div>
            </div>
          </div>

        </div>

        <div
          className="mt-8 pt-6 flex flex-wrap gap-4 items-center justify-between text-[11px]"
          style={{ borderTop: "1px solid rgba(196,151,58,0.08)", color: "rgba(154,144,128,0.50)" }}
        >
          <span>Balea Sphere is not affiliated with any government body. Membership is by application and at the sole discretion of the curation team.</span>
          <div className="flex gap-4">
            <a href="mailto:privacy@balea-sphere8.com" className="hover:underline" style={{ color: "rgba(196,151,58,0.50)" }}>Privacy Contact</a>
            <a href="/settings" className="hover:underline" style={{ color: "rgba(196,151,58,0.50)" }}>Delete My Data</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
