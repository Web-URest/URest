/**
 * Shared renderer for the legal/policy pages (#36, PRD §6). Content is Thai-first
 * and lives in per-route `content.ts` modules (long legal documents are content,
 * not UI chrome — same rationale as in-code notification templates), so this
 * component is purely presentational. Every document shows a DRAFT banner until
 * the team's lawyer review (PRD §6) clears it.
 */
export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  title: string;
  /** e.g. "ฉบับร่าง · มิถุนายน 2569" */
  updated: string;
  intro?: string;
  sections: LegalSection[];
}

export function PolicyDoc({ doc }: { doc: LegalDoc }) {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 text-ink-900">
      <p className="rounded-card border border-pending-400 bg-pending-50 px-4 py-3 text-sm text-pending-700">
        ⚠️ เอกสารฉบับร่าง — อยู่ระหว่างการตรวจสอบทางกฎหมาย ยังไม่มีผลผูกพันจนกว่าจะเผยแพร่ฉบับสมบูรณ์
      </p>

      <h1 className="mt-8 font-display text-3xl font-bold text-ink-900">{doc.title}</h1>
      <p className="mt-1 text-sm text-ink-500">{doc.updated}</p>
      {doc.intro && <p className="mt-4 leading-relaxed text-ink-700">{doc.intro}</p>}

      <div className="mt-8 space-y-8">
        {doc.sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display text-xl font-semibold text-ink-900">
              {i + 1}. {s.heading}
            </h2>
            <div className="mt-2 space-y-3">
              {s.paragraphs.map((p, j) => (
                <p key={j} className="leading-relaxed text-ink-700">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
