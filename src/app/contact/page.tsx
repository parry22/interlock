"use client";

import { useState, useRef, useEffect } from "react";
import { LandingNav } from "@/components/LandingNav";
import { Footer } from "@/components/Footer";

/* ── Full-width form dropdown ─────────────────────────────────────────── */
function FormDropdown({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[14px] text-left outline-none transition-colors"
        style={{
          border: `1px solid ${open ? "#3064FF55" : "#1e1e1e"}`,
          background: "#0a0a0b",
          color: selected ? "#ffffff" : "#3a3a3a",
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="#3a3a3a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl overflow-hidden shadow-2xl z-50"
          style={{ background: "#111113", border: "1px solid #272727" }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center px-4 py-2.5 text-left text-[13px] transition-colors"
              style={{
                background: opt.value === value ? "#1a1a1a" : "transparent",
                color: opt.value === value ? "#d4d4d4" : "#5a5a5a",
              }}
              onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = "#161616"; e.currentTarget.style.color = "#a3a3a3"; }}
              onMouseLeave={e => { e.currentTarget.style.background = opt.value === value ? "#1a1a1a" : "transparent"; e.currentTarget.style.color = opt.value === value ? "#d4d4d4" : "#5a5a5a"; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Icons (neutral grey throughout) ─────────────────────────────────── */
const EmailIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 3.5C1 2.67 1.67 2 2.5 2h9C12.33 2 13 2.67 13 3.5v7c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-7Z" stroke="#3a3a3a" strokeWidth="1.2"/>
    <path d="M1 4l6 4 6-4" stroke="#3a3a3a" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
const PinIcon = (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M6.5 1C4.29 1 2.5 2.79 2.5 5c0 3.25 4 7 4 7s4-3.75 4-7c0-2.21-1.79-4-4-4Z" stroke="#3a3a3a" strokeWidth="1.2"/>
    <circle cx="6.5" cy="5" r="1.25" stroke="#3a3a3a" strokeWidth="1.2"/>
  </svg>
);
const ClockIcon = (
  <svg className="mt-0.5 flex-shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="#3a3a3a" strokeWidth="1.2"/>
    <path d="M7 4v3.5l2 2" stroke="#3a3a3a" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

/* ── Contact row ──────────────────────────────────────────────────────── */
function ContactRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: "#111113", border: "1px solid #1e1e1e" }}>
        {icon}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#3a3a3a" }}>{label}</span>
        <a href={href} className="text-[13px] transition-colors hover:text-white" style={{ color: "#808080" }}>{value}</a>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", role: "", useCase: "", message: "" });

  function handleInput(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.useCase) return;
    setSubmitted(true);
  }

  const ROLES = [
    { value: "founder",     label: "Founder / Co-founder" },
    { value: "engineering", label: "Engineering" },
    { value: "product",     label: "Product" },
    { value: "finance",     label: "Finance / Billing" },
    { value: "other",       label: "Other" },
  ];

  const USE_CASES = [
    { value: "agent-platform",   label: "AI agent platform or marketplace" },
    { value: "vertical-saas",    label: "Vertical SaaS with AI workflows" },
    { value: "ai-api",           label: "AI API / developer tooling" },
    { value: "outcome-billing",  label: "Outcome-based billing product" },
    { value: "internal-tooling", label: "Internal cost tracking / FinOps" },
    { value: "other",            label: "Something else" },
  ];

  return (
    <div className="min-h-full flex flex-col bg-black text-white">
      <div className="pointer-events-none fixed inset-0 z-0" style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(30, 60, 180, 0.07) 0%, transparent 70%)" }} />

      <LandingNav />

      <div className="relative z-10 w-full flex-1 pt-32 pb-24 px-5">
        <div className="max-w-[1080px] mx-auto">

          {/* Header */}
          <div className="mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3064FF" }}>Company</span>
          </div>
          <h1 className="font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 3.8vw, 42px)", lineHeight: 1.12 }}>
            Get in Touch
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed max-w-[480px]" style={{ color: "#808080" }}>
            Tell us what you are building. If it involves pricing AI workflows,
            settling outcomes, or managing agent costs at scale — we want to hear it.
          </p>

          <div className="mt-8 mb-12" style={{ borderTop: "1px solid #1a1a1a" }} />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-16">

            {/* ── Form ───────────────────────────────────────── */}
            <div>
              {submitted ? (
                <div className="rounded-2xl px-8 py-12 flex flex-col gap-4" style={{ background: "#0d0d0f", border: "1px solid #1e1e1e" }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(48,100,255,0.12)", border: "1px solid rgba(48,100,255,0.2)" }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M3.5 9.5L7 13L14.5 5" stroke="#3064FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="text-[20px] font-semibold text-white">Message received.</h2>
                  <p className="text-[14px] leading-relaxed" style={{ color: "#808080" }}>
                    We read every submission personally. If your use case is a fit, you will hear from us within one business day.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                  {/* Name + Company */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Field label="Full Name" required>
                      <input required type="text" name="name" value={form.name} onChange={handleInput} placeholder="Jane Smith" className="w-full rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-[#3a3a3a] outline-none transition-colors" style={{ border: "1px solid #1e1e1e", background: "#0a0a0b" }} onFocus={e => (e.currentTarget.style.borderColor = "#3064FF55")} onBlur={e => (e.currentTarget.style.borderColor = "#1e1e1e")} />
                    </Field>
                    <Field label="Company" required>
                      <input required type="text" name="company" value={form.company} onChange={handleInput} placeholder="Acme AI" className="w-full rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-[#3a3a3a] outline-none transition-colors" style={{ border: "1px solid #1e1e1e", background: "#0a0a0b" }} onFocus={e => (e.currentTarget.style.borderColor = "#3064FF55")} onBlur={e => (e.currentTarget.style.borderColor = "#1e1e1e")} />
                    </Field>
                  </div>

                  {/* Email + Role */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Field label="Work Email" required>
                      <input required type="email" name="email" value={form.email} onChange={handleInput} placeholder="jane@acme.ai" className="w-full rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-[#3a3a3a] outline-none transition-colors" style={{ border: "1px solid #1e1e1e", background: "#0a0a0b" }} onFocus={e => (e.currentTarget.style.borderColor = "#3064FF55")} onBlur={e => (e.currentTarget.style.borderColor = "#1e1e1e")} />
                    </Field>
                    <Field label="Role">
                      <FormDropdown placeholder="Select your role" value={form.role} options={ROLES} onChange={(v) => setForm((p) => ({ ...p, role: v }))} />
                    </Field>
                  </div>

                  {/* Use case */}
                  <Field label="What are you building?" required>
                    <FormDropdown placeholder="Select the closest match" value={form.useCase} options={USE_CASES} onChange={(v) => setForm((p) => ({ ...p, useCase: v }))} />
                  </Field>

                  {/* Message */}
                  <Field label="Tell us more">
                    <textarea name="message" value={form.message} onChange={handleInput} rows={5} placeholder="Describe your current billing setup, the problem you're hitting, or what you want to explore with Interlock." className="w-full rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-[#3a3a3a] outline-none resize-none transition-colors" style={{ border: "1px solid #1e1e1e", background: "#0a0a0b" }} onFocus={e => (e.currentTarget.style.borderColor = "#3064FF55")} onBlur={e => (e.currentTarget.style.borderColor = "#1e1e1e")} />
                  </Field>

                  {/* Submit */}
                  <div className="flex items-center gap-4 pt-1">
                    <button type="submit" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#3064FF" }}>
                      Send Message
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <span className="text-[12px]" style={{ color: "#3a3a3a" }}>We respond within one business day.</span>
                  </div>

                </form>
              )}
            </div>

            {/* ── Contact sidebar ─────────────────────────────── */}
            <div className="flex flex-col gap-8">

              <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: "#0d0d0f", border: "1px solid #1e1e1e" }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3a3a3a" }}>Direct Contact</p>
                <ContactRow icon={EmailIcon} label="General"      value="team@interlock.xyz"     href="mailto:team@interlock.xyz" />
                <ContactRow icon={EmailIcon} label="Partnerships" value="partners@interlock.xyz"  href="mailto:partners@interlock.xyz" />
                <ContactRow icon={EmailIcon} label="Security"     value="security@interlock.xyz"  href="mailto:security@interlock.xyz" />
              </div>

              <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: "#0d0d0f", border: "1px solid #1e1e1e" }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#3a3a3a" }}>Office</p>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: "#111113", border: "1px solid #1e1e1e" }}>{PinIcon}</div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-medium text-white">Bengaluru, Karnataka</span>
                    <span className="text-[13px]" style={{ color: "#808080" }}>India</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl p-5 flex items-start gap-3" style={{ background: "#0d0d0f", border: "1px solid #1e1e1e" }}>
                {ClockIcon}
                <p className="text-[13px] leading-relaxed" style={{ color: "#808080" }}>
                  We are a small team. Every message is read by a founder. We do not use
                  auto-responders for inbound — if we reply, it is a real conversation.
                </p>
              </div>

            </div>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ── Label wrapper ────────────────────────────────────────────────────── */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12px] font-medium" style={{ color: "#5a5a5a" }}>
        {label}{required && <span style={{ color: "#3064FF" }}> *</span>}
      </label>
      {children}
    </div>
  );
}
