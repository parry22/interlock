import { LegalLayout, LSection, LP, LList, LItem, LSub, LNote } from "@/components/LegalLayout";

export const metadata = {
  title: "Security — Interlock",
  description: "How Interlock protects your data and the integrity of every settlement.",
};

export default function SecurityPage() {
  return (
    <LegalLayout
      badge="Security"
      title="Security at Interlock"
      lastUpdated="May 28, 2026"
    >

      <LP>
        Security is foundational to Interlock — not a feature. Every settlement on our platform involves real money, real AI decisions, and real business data. This page describes the controls, architecture, and practices we use to protect all of it.
      </LP>

      {/* 1 */}
      <LSection title="1. Security Philosophy">
        <LP>
          We design for adversarial conditions from the start. Our threat model assumes that any single layer can be compromised — so we layer controls such that a breach at one layer cannot cascade into a full system compromise or fund loss. Key principles:
        </LP>
        <LList>
          <LItem><strong className="text-white">Defence in depth.</strong> Multiple independent controls protect every critical operation. A compromised off-chain verifier cannot drain escrow funds because the Solidity smart contracts enforce independent invariants on-chain.</LItem>
          <LItem><strong className="text-white">Cryptographic finality.</strong> Settlement logic lives in audited Solidity smart contracts on the Avalanche blockchain. Once a settlement is verified and recorded on-chain, no off-chain actor — including us — can alter or reverse it.</LItem>
          <LItem><strong className="text-white">Least privilege.</strong> Every service, API key, and database credential is scoped to the minimum permissions required for its function. We do not use shared root credentials anywhere.</LItem>
          <LItem><strong className="text-white">Transparency.</strong> We disclose our security architecture publicly (this page), publish smart contract source code, and maintain a responsible disclosure programme.</LItem>
        </LList>
      </LSection>

      {/* 2 */}
      <LSection title="2. Blockchain and Smart Contract Security">
        <LSub title="Solidity Smart Contracts" />
        <LP>
          All settlement logic is implemented in the Solidity programming language, which provides strong resource safety and type guarantees. Our smart contract package enforces:
        </LP>
        <LList>
          <LItem>Phantom-typed escrow that cannot be accidentally released to the wrong coin type.</LItem>
          <LItem>On-chain invariant checks: all split recipients must be registered in the ProviderRegistry, the sum of all splits cannot exceed the escrowed amount, the platform fee cannot exceed its configured cap, and no self-payment is permitted.</LItem>
          <LItem>A dispute window during which settlement is blocked, allowing customers to raise challenges before funds are released.</LItem>
          <LItem>Permissionless settlement: anyone can trigger settlement after the dispute window closes, preventing Interlock from unilaterally delaying payouts.</LItem>
          <LItem>All-or-nothing atomicity: settlement is executed in a single single atomic transaction. Gas exhaustion or any failure reverts the entire transaction — no partial payments are possible.</LItem>
        </LList>

        <LSub title="Attestation and Outcome Verification" />
        <LP>
          Outcome verification runs inside a Trusted Execution Environment (AWS Nitro Enclave in production). The enclave:
        </LP>
        <LList>
          <LItem>Evaluates the success criteria you configured against the actual workflow output — without the host OS being able to observe the computation.</LItem>
          <LItem>Signs the attestation payload with a private key that never leaves the enclave&rsquo;s encrypted memory.</LItem>
          <LItem>Commits all evidence blobs (outcome, trace, proof) to Walrus, recording tamper-evident content hashes on-chain.</LItem>
        </LList>
        <LP>
          The Solidity contract verifies the enclave&rsquo;s attestation before permitting settlement. A compromised application layer cannot forge a valid attestation without access to the enclave&rsquo;s key — and even then, contract-side invariants remain independently enforced.
        </LP>
        <LNote>
          During the current early-access period, the verifier runs on a Vercel serverless function signed with a registered ECDSA development key. The same contract-side invariants apply. Production Nitro Enclave deployment is scheduled for the next platform milestone.
        </LNote>
      </LSection>

      {/* 3 */}
      <LSection title="3. Data Security">
        <LSub title="Encryption in Transit" />
        <LList>
          <LItem>All traffic between your browser or SDK and our platform is encrypted using TLS 1.3.</LItem>
          <LItem>We enforce HTTPS everywhere; plain HTTP requests are redirected.</LItem>
          <LItem>API endpoints are served over HTTPS with HSTS enabled.</LItem>
        </LList>

        <LSub title="Encryption at Rest" />
        <LList>
          <LItem>Our managed Postgres database (Neon) encrypts all data at rest using AES-256.</LItem>
          <LItem>Workflow artifacts and outcome evidence stored on Walrus are content-addressed — any tampering changes the blob hash, which is independently verifiable against the on-chain record.</LItem>
          <LItem>Secrets (API keys, database credentials, signing keys) are managed via environment variable isolation — never hardcoded in source code or committed to version control.</LItem>
        </LList>

        <LSub title="Credential Security" />
        <LList>
          <LItem>Passwords are stored as salted bcrypt hashes. Plaintext passwords are never written to disk, logs, or databases.</LItem>
          <LItem>API keys are hashed before storage; only the prefix is stored in recoverable form for display.</LItem>
          <LItem>Session tokens are rotated on each authentication event.</LItem>
        </LList>
      </LSection>

      {/* 4 */}
      <LSection title="4. Application Security">
        <LList>
          <LItem><strong className="text-white">TypeScript strict mode</strong> is enforced across all application code, eliminating a broad class of type-confusion bugs.</LItem>
          <LItem><strong className="text-white">Input validation</strong> is applied on every API endpoint before data is processed or persisted.</LItem>
          <LItem><strong className="text-white">Rate limiting</strong> is applied to all public and authenticated endpoints to mitigate brute-force and abuse.</LItem>
          <LItem><strong className="text-white">Content Security Policy</strong> headers restrict which resources the browser can load, mitigating cross-site scripting.</LItem>
          <LItem><strong className="text-white">CSRF protection</strong> is enforced on all state-changing requests.</LItem>
          <LItem><strong className="text-white">Dependency management:</strong> we use automated dependency scanning and apply security patches promptly. Direct dependencies are pinned to reviewed versions.</LItem>
          <LItem><strong className="text-white">No secrets in logs:</strong> our logging configuration explicitly redacts credential, key, and token fields from all log output.</LItem>
        </LList>
      </LSection>

      {/* 5 */}
      <LSection title="5. Infrastructure Security">
        <LP>
          Our production infrastructure is hosted on Vercel (application layer) and Neon (database), both of which provide:
        </LP>
        <LList>
          <LItem>DDoS mitigation and global edge network distribution.</LItem>
          <LItem>SOC 2 Type II certified environments.</LItem>
          <LItem>Automated backups with point-in-time recovery.</LItem>
          <LItem>Private networking for database connections — the database is not exposed to the public internet.</LItem>
        </LList>
      </LSection>

      {/* 6 */}
      <LSection title="6. Access Controls">
        <LList>
          <LItem>Production systems are accessible only to engineers with a business need. Access is reviewed quarterly and revoked immediately upon role change or departure.</LItem>
          <LItem>Multi-factor authentication (MFA) is required for all admin and production access.</LItem>
          <LItem>All access to production data is logged and auditable.</LItem>
          <LItem>Database access uses dedicated credentials per service role, scoped to the minimum required permissions.</LItem>
        </LList>
      </LSection>

      {/* 7 */}
      <LSection title="7. Responsible Disclosure">
        <LP>
          We operate a responsible disclosure programme and welcome reports from security researchers. If you discover a vulnerability in the Interlock platform, smart contracts, or infrastructure, please report it to us privately before public disclosure.
        </LP>

        <LSub title="How to report" />
        <LList>
          <LItem>
            Email:{" "}
            <a href="mailto:security@interlock.xyz" className="text-white underline underline-offset-2">
              security@interlock.xyz
            </a>
          </LItem>
          <LItem>Include a description of the vulnerability, steps to reproduce, and the potential impact.</LItem>
          <LItem>Encrypt sensitive reports using our PGP key (available on request).</LItem>
        </LList>

        <LSub title="Our commitments to researchers" />
        <LList>
          <LItem>We will acknowledge receipt within 2 business days.</LItem>
          <LItem>We will investigate and provide an initial assessment within 7 business days.</LItem>
          <LItem>We will work with you to understand and resolve the issue before public disclosure.</LItem>
          <LItem>We request a 90-day coordinated disclosure window from the date we confirm the issue.</LItem>
          <LItem>We will not pursue legal action against researchers who follow this responsible disclosure process in good faith.</LItem>
          <LItem>We acknowledge all confirmed, valid vulnerabilities in our public Security Hall of Fame.</LItem>
        </LList>

        <LNote>
          In-scope: interlock.xyz and all subdomains, the Interlock Solidity smart contract package, the TypeScript SDK, and the public API. Out-of-scope: third-party infrastructure (Vercel, Neon, Avalanche network), social engineering attacks, and physical attacks.
        </LNote>
      </LSection>

      {/* 8 */}
      <LSection title="8. Incident Response">
        <LP>
          We maintain a documented incident response plan. In the event of a security incident:
        </LP>
        <LList>
          <LItem><strong className="text-white">Detection and triage</strong> — automated alerting triggers on anomalous activity. All alerts are triaged within 4 hours during business days.</LItem>
          <LItem><strong className="text-white">Containment</strong> — affected systems are isolated and credentials are rotated as required.</LItem>
          <LItem><strong className="text-white">Analysis and remediation</strong> — root cause analysis is conducted and the fix is deployed before affected systems are returned to service.</LItem>
          <LItem><strong className="text-white">Notification</strong> — affected users are notified within 72 hours of a confirmed breach that creates a material risk to their data or funds. Where legally required, we notify relevant supervisory authorities within the same window.</LItem>
          <LItem><strong className="text-white">Post-incident review</strong> — a written post-mortem is completed within 14 days of every significant incident.</LItem>
        </LList>
      </LSection>

      {/* 9 */}
      <LSection title="9. Data Compliance Declarations">
        <LP>
          In accordance with our commitment to transparency, we declare all data points collected by the Interlock platform:
        </LP>
        <LList>
          <LItem><strong className="text-white">Identity data:</strong> full name, business email address, company name, job title.</LItem>
          <LItem><strong className="text-white">Authentication data:</strong> hashed password, session tokens, MFA device identifiers.</LItem>
          <LItem><strong className="text-white">Network data:</strong> IP address, referring URL, exit URL.</LItem>
          <LItem><strong className="text-white">Device and browser data:</strong> browser type and version, operating system, device type (desktop/mobile), screen resolution.</LItem>
          <LItem><strong className="text-white">Usage and analytics:</strong> pages visited, features used, API calls made (endpoint, timestamp, response code), workflow counts, error occurrences.</LItem>
          <LItem><strong className="text-white">Workflow execution data:</strong> inputs and outputs submitted to AI workflows, token counts, tool call records, execution duration, cost attribution data.</LItem>
          <LItem><strong className="text-white">Blockchain data:</strong> Avalanche wallet addresses, transaction hashes, on-chain object IDs, USDC amounts, settlement records.</LItem>
          <LItem><strong className="text-white">Storage data:</strong> Walrus blob IDs and SHA-256 content hashes for outcome artifacts.</LItem>
          <LItem><strong className="text-white">Billing data:</strong> subscription plan, invoice history, GMV amounts, USDC payout records. We do not collect or store credit card numbers.</LItem>
          <LItem><strong className="text-white">Communication data:</strong> messages sent via contact form or email to our team addresses.</LItem>
          <LItem><strong className="text-white">Cookies:</strong> strictly necessary session cookies, preference cookies, and analytics identifiers. No cross-site tracking cookies.</LItem>
        </LList>
        <LP>
          We do not collect: location data beyond country-level IP geolocation, photos or camera access, microphone or audio data, contacts, calendar data, biometric data, or health information.
        </LP>
      </LSection>

      {/* 10 */}
      <LSection title="10. Contact">
        <LP>
          For security-related matters, contact our security team at{" "}
          <a href="mailto:security@interlock.xyz" className="text-white underline underline-offset-2">
            security@interlock.xyz
          </a>
          . For privacy matters, see our{" "}
          <a href="/privacy" className="text-white underline underline-offset-2">
            Privacy Policy
          </a>
          . For all other enquiries, reach us at{" "}
          <a href="mailto:team@interlock.xyz" className="text-white underline underline-offset-2">
            team@interlock.xyz
          </a>
          .
        </LP>
      </LSection>

    </LegalLayout>
  );
}
