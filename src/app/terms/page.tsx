import { LegalLayout, LSection, LP, LList, LItem, LSub, LNote } from "@/components/LegalLayout";

export const metadata = {
  title: "Terms of Service — Interlock",
  description: "The rules governing your use of the Interlock platform.",
};

export default function TermsPage() {
  return (
    <LegalLayout
      badge="Legal"
      title="Terms of Service"
      lastUpdated="May 28, 2026"
    >

      <LP>
        These Terms of Service (&ldquo;Terms&rdquo;) form a legally binding agreement between you and Interlock (&ldquo;Interlock&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) governing your access to and use of the platform available at interlock.xyz and all associated APIs, SDKs, and services (collectively, the &ldquo;Service&rdquo;). Please read them carefully.
      </LP>
      <LP>
        By creating an account or using the Service in any way, you confirm that you have read, understood, and agree to be bound by these Terms and our{" "}
        <a href="/privacy" className="text-white underline underline-offset-2">Privacy Policy</a>.
        If you are using the Service on behalf of a business, you represent that you have the authority to bind that business to these Terms.
      </LP>

      {/* 1 */}
      <LSection title="1. Eligibility">
        <LP>
          You must be at least 18 years old and capable of entering into a legally binding contract to use the Service. The Service is intended for businesses and professionals — it is not a consumer product. We reserve the right to refuse service to anyone at any time.
        </LP>
      </LSection>

      {/* 2 */}
      <LSection title="2. Description of Service">
        <LP>
          Interlock is a business-to-business platform that provides AI workflow cost intelligence, outcome-based pricing, USDC escrow, and multi-party atomic settlement on the Avalanche blockchain. Key capabilities include:
        </LP>
        <LList>
          <LItem>Real-time cost attribution and margin tracking for AI agent workflows</LItem>
          <LItem>Pre-execution quote generation and stop-loss guardrails</LItem>
          <LItem>Outcome verification and cryptographic attestation via Trusted Execution Environments</LItem>
          <LItem>USDC escrow and atomic multi-party settlement on Avalanche</LItem>
          <LItem>Webhook delivery, an API, and a TypeScript SDK for integration</LItem>
        </LList>
        <LP>
          We may modify, suspend, or discontinue any feature of the Service at any time. We will provide reasonable notice of material changes where practicable.
        </LP>
      </LSection>

      {/* 3 */}
      <LSection title="3. Account Registration and Security">
        <LP>
          To access the Service you must register for an account. You agree to:
        </LP>
        <LList>
          <LItem>Provide accurate, current, and complete information during registration and keep it updated.</LItem>
          <LItem>Keep your credentials confidential and not share them with any third party.</LItem>
          <LItem>Notify us immediately at{" "}
            <a href="mailto:team@interlock.xyz" className="text-white underline underline-offset-2">team@interlock.xyz</a>{" "}
            if you suspect unauthorised access to your account.
          </LItem>
          <LItem>Accept responsibility for all activity that occurs under your account, whether or not authorised by you.</LItem>
        </LList>
        <LP>
          We reserve the right to disable any account we reasonably believe has been compromised or is being used in violation of these Terms.
        </LP>
      </LSection>

      {/* 4 */}
      <LSection title="4. Acceptable Use">
        <LP>You agree not to use the Service to:</LP>
        <LList>
          <LItem>Violate any applicable law, regulation, or third-party right.</LItem>
          <LItem>Process, store, or transmit unlawful content, including content that infringes intellectual property rights, is defamatory, or constitutes harassment or abuse.</LItem>
          <LItem>Submit regulated personal data (such as health records, payment card numbers, or government ID numbers) to workflow inputs unless you have obtained all required consents and disclosures.</LItem>
          <LItem>Reverse-engineer, decompile, or attempt to extract the source code of the Service.</LItem>
          <LItem>Circumvent or disable any security, rate-limiting, or access-control mechanism.</LItem>
          <LItem>Introduce malware, viruses, or other harmful code.</LItem>
          <LItem>Use the Service to operate a competing product or service, or to benchmark the Service for publication without our prior written consent.</LItem>
          <LItem>Abuse the USDC escrow or settlement system — including submitting fraudulent workflow outcomes or manipulating attestation payloads.</LItem>
          <LItem>Engage in any activity that places unreasonable load on our infrastructure or degrades service quality for other users.</LItem>
        </LList>
        <LNote>
          Breach of this section may result in immediate account suspension and, where required by law, referral to law enforcement.
        </LNote>
      </LSection>

      {/* 5 */}
      <LSection title="5. Blockchain Transactions and USDC Escrow">
        <LP>
          Transactions executed on the Avalanche blockchain — including USDC escrow creation, attestation submission, and settlement — are irreversible once confirmed. You acknowledge and accept that:
        </LP>
        <LList>
          <LItem>We cannot reverse, cancel, or modify any confirmed on-chain transaction.</LItem>
          <LItem>You are solely responsible for the accuracy of wallet addresses you provide. Funds sent to an incorrect address are permanently lost.</LItem>
          <LItem>Blockchain networks may experience congestion, downtime, or forks outside our control that delay or prevent settlement.</LItem>
          <LItem>Smart contract code, while audited, may contain undiscovered bugs. We accept no liability for losses arising from smart contract vulnerabilities beyond those caused by our own gross negligence.</LItem>
          <LItem>USDC is a third-party stablecoin issued by Circle. Its value and availability are not guaranteed by Interlock.</LItem>
          <LItem>The regulatory status of cryptocurrency and blockchain-based settlement varies by jurisdiction. You are responsible for understanding and complying with the laws applicable to you.</LItem>
        </LList>
      </LSection>

      {/* 6 */}
      <LSection title="6. Fees and Billing">
        <LSub title="6.1 Subscription Fees" />
        <LP>
          Paid plans are billed monthly or annually in advance. Fees are non-refundable except as required by applicable law. We will notify you of fee changes at least 30 days before they take effect, and you may cancel before the new fees apply.
        </LP>

        <LSub title="6.2 GMV-Based Fees" />
        <LP>
          In addition to any subscription fee, we charge a percentage of Gross Merchandise Value (&ldquo;GMV&rdquo;) — the total value of workflows that successfully complete and settle through Interlock. The applicable rate is shown in your plan details. GMV fees are charged only on successfully settled workflows; failed workflows, refunds, and unresolved disputes are excluded.
        </LP>

        <LSub title="6.3 Taxes" />
        <LP>
          All fees are exclusive of applicable taxes (including GST, VAT, and sales tax). You are responsible for all taxes applicable to your use of the Service. Where Interlock is legally required to collect taxes, we will do so.
        </LP>

        <LSub title="6.4 Suspension for Non-Payment" />
        <LP>
          If any amount is overdue, we may suspend your access to the Service after providing 10 days&rsquo; written notice. We will restore access promptly upon receipt of all overdue amounts.
        </LP>
      </LSection>

      {/* 7 */}
      <LSection title="7. Intellectual Property">
        <LSub title="7.1 Our IP" />
        <LP>
          All intellectual property rights in the Service — including the software, algorithms, trademarks, trade names, logos, user interface designs, and documentation — are owned by or licensed to Interlock. These Terms do not grant you any rights in our IP other than the limited licence described below.
        </LP>

        <LSub title="7.2 Licence to You" />
        <LP>
          Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable licence to access and use the Service for your internal business purposes during the term of your subscription.
        </LP>

        <LSub title="7.3 Your Data and Content" />
        <LP>
          You retain all ownership rights in the data, content, and workflow configurations you submit to the Service (&ldquo;Customer Data&rdquo;). You grant Interlock a non-exclusive, worldwide licence to process, store, and use Customer Data solely to provide and improve the Service for you. We will not use your Customer Data to train AI models or share it with third parties except as described in our Privacy Policy.
        </LP>

        <LSub title="7.4 Feedback" />
        <LP>
          If you provide feedback, suggestions, or ideas about the Service, you grant Interlock a perpetual, irrevocable, royalty-free licence to use that feedback for any purpose without obligation to you.
        </LP>
      </LSection>

      {/* 8 */}
      <LSection title="8. Confidentiality">
        <LP>
          Each party may receive confidential information of the other in connection with the Service (&ldquo;Confidential Information&rdquo;). Each party agrees to: (a) keep Confidential Information secret using at least the same degree of care it uses for its own confidential information, but no less than reasonable care; (b) use Confidential Information only to exercise rights and perform obligations under these Terms; and (c) not disclose Confidential Information to any third party without prior written consent, except to employees or contractors who need to know it and are bound by confidentiality obligations no less protective than these.
        </LP>
        <LP>
          These obligations do not apply to information that is or becomes publicly available through no fault of the receiving party, is independently developed, or is required to be disclosed by law.
        </LP>
      </LSection>

      {/* 9 */}
      <LSection title="9. Disclaimers">
        <LP>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, INTERLOCK DISCLAIMS ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </LP>
        <LP>
          WE DO NOT WARRANT THAT: (a) THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE; (b) AI OUTCOMES WILL BE ACCURATE, COMPLETE, OR FIT FOR ANY PARTICULAR PURPOSE; (c) THE AVALANCHE BLOCKCHAIN OR ANY THIRD-PARTY NETWORK WILL PERFORM AS EXPECTED; OR (d) ANY DEFECTS WILL BE CORRECTED.
        </LP>
        <LP>
          AI-generated outputs processed through your workflows are probabilistic and may be inaccurate. Interlock verifies outcomes against the success criteria you configure — it does not independently validate the correctness, safety, or legality of AI-generated content.
        </LP>
      </LSection>

      {/* 10 */}
      <LSection title="10. Limitation of Liability">
        <LP>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL INTERLOCK OR ITS DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </LP>
        <LP>
          INTERLOCK&rsquo;S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF: (a) THE TOTAL FEES PAID BY YOU TO INTERLOCK IN THE TWELVE MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM; OR (b) USD 100.
        </LP>
        <LP>
          SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN WARRANTIES OR DAMAGES. IN THOSE JURISDICTIONS, OUR LIABILITY IS LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.
        </LP>
        <LNote>
          The limitations above apply regardless of the legal theory under which a claim is brought — whether in contract, tort (including negligence), strict liability, or otherwise — and reflect a reasonable allocation of risk between the parties.
        </LNote>
      </LSection>

      {/* 11 */}
      <LSection title="11. Indemnification">
        <LP>
          You agree to indemnify, defend, and hold harmless Interlock and its officers, directors, employees, agents, licensors, and service providers from and against any claims, liabilities, damages, judgements, awards, losses, costs, and expenses (including reasonable legal fees) arising out of or relating to:
        </LP>
        <LList>
          <LItem>Your use of or inability to use the Service.</LItem>
          <LItem>Your violation of these Terms or any applicable law.</LItem>
          <LItem>Your Customer Data — including any claim that it infringes a third party&rsquo;s intellectual property rights or violates any privacy law.</LItem>
          <LItem>Any fraud or wilful misconduct by you or your authorised users.</LItem>
        </LList>
      </LSection>

      {/* 12 */}
      <LSection title="12. Term and Termination">
        <LSub title="12.1 Term" />
        <LP>
          These Terms are effective from the date you first use the Service and continue until your account is terminated.
        </LP>

        <LSub title="12.2 Termination by You" />
        <LP>
          You may cancel your account at any time from your account settings or by emailing team@interlock.xyz. Cancellation takes effect at the end of the current billing period; you will retain access until then.
        </LP>

        <LSub title="12.3 Termination by Us" />
        <LP>
          We may suspend or terminate your account: (a) immediately if you materially breach these Terms and the breach is not cured within 10 days of notice; (b) immediately for fraud, illegal activity, or threats to security; (c) with 30 days&rsquo; notice for any other reason.
        </LP>

        <LSub title="12.4 Effect of Termination" />
        <LP>
          Upon termination, your licence to use the Service ceases. We will provide a 30-day window after termination during which you may export your Customer Data. After this window, we may delete your data from our systems (subject to our legal obligations). On-chain data remains permanent. Sections that by their nature should survive termination — including Sections 7, 8, 9, 10, 11, and 13 — will survive.
        </LP>
      </LSection>

      {/* 13 */}
      <LSection title="13. Governing Law and Dispute Resolution">
        <LSub title="13.1 Governing Law" />
        <LP>
          These Terms are governed by and construed in accordance with the laws of the State of Karnataka, India, without regard to its conflict of law provisions.
        </LP>

        <LSub title="13.2 Dispute Resolution" />
        <LP>
          In the event of any dispute, the parties will first attempt to resolve it through good-faith negotiation for a period of 30 days after written notice. If the dispute is not resolved within that period, it will be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996 of India. The seat of arbitration will be Bengaluru, Karnataka. The language of arbitration will be English.
        </LP>

        <LSub title="13.3 Injunctive Relief" />
        <LP>
          Nothing in this section prevents either party from seeking urgent injunctive or equitable relief from a court of competent jurisdiction to prevent irreparable harm.
        </LP>
      </LSection>

      {/* 14 */}
      <LSection title="14. Changes to These Terms">
        <LP>
          We may update these Terms from time to time. We will notify you of material changes by posting a notice on our website and, where we have your email, by sending you an email at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the revised Terms. If you do not agree, you must stop using the Service and cancel your account before the effective date.
        </LP>
      </LSection>

      {/* 15 */}
      <LSection title="15. General Provisions">
        <LList>
          <LItem><strong className="text-white">Entire agreement.</strong> These Terms, together with the Privacy Policy and any order forms, constitute the entire agreement between the parties regarding the Service and supersede all prior agreements and understandings.</LItem>
          <LItem><strong className="text-white">Severability.</strong> If any provision of these Terms is held invalid or unenforceable, it will be modified to the minimum extent necessary to make it enforceable, and the remaining provisions will continue in full force.</LItem>
          <LItem><strong className="text-white">No waiver.</strong> Our failure to enforce any provision of these Terms is not a waiver of that provision or our right to enforce it in the future.</LItem>
          <LItem><strong className="text-white">Assignment.</strong> You may not assign or transfer these Terms or any rights hereunder without our prior written consent. We may assign these Terms without restriction, including in connection with a merger, acquisition, or sale of assets. These Terms bind and inure to the benefit of permitted successors and assigns.</LItem>
          <LItem><strong className="text-white">Force majeure.</strong> Neither party is liable for delays or failures in performance resulting from causes beyond its reasonable control, including natural disasters, government actions, blockchain network outages, or failures of third-party infrastructure.</LItem>
          <LItem><strong className="text-white">No third-party beneficiaries.</strong> These Terms do not create any rights in third parties.</LItem>
          <LItem><strong className="text-white">Contact.</strong> For questions about these Terms, email{" "}
            <a href="mailto:team@interlock.xyz" className="text-white underline underline-offset-2">team@interlock.xyz</a>.
          </LItem>
        </LList>
      </LSection>

    </LegalLayout>
  );
}
