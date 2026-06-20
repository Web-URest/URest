# Runbook — Personal-data breach response (PDPC ≤72h)

**Owner:** founder / data controller · **Basis:** PDPA + ADR-010 §8 · Status: DRAFT — review with a second teammate before launch.

A qualifying personal-data breach must be notified to the **PDPC (สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล / สคส.)** within **72 hours** of becoming aware, and to affected users when the risk to them is **high**.

## 1. Detect & contain (immediately)
- Confirm the incident (unauthorised access, loss, leak, or unlawful disclosure of personal data).
- Contain it: rotate the affected credentials/keys, revoke sessions, take the affected surface offline if needed.
- Start a timestamped incident log (this starts the 72h clock at "becoming aware").

## 2. Assess scope
- What data? (account fields, KYC docs, messages, payout account, logs.) Note: card data never touches our servers (Opn); the Thai ID number is never stored.
- Whose data, and how many people?
- Was it encrypted / anonymised? (Field-encrypted columns and anonymised rows lower the risk rating.)

## 3. Classify risk
- **High-risk** (notify users too): exposure that enables account takeover, financial harm, or exposes identity documents / sensitive data to an unauthorised party.
- **Lower-risk** (PDPC only, if it still qualifies): exposure limited to encrypted/anonymised data with no practical way to harm a person.

## 4. Notify
- **PDPC within 72h** via the official portal. Include: nature of the breach, categories + approximate number of data subjects and records, likely consequences, measures taken/proposed, and a contact point.
- **Affected users (when high-risk)** by email, in plain Thai: what happened, what data, what they should do (e.g. change password, watch for fraud), and our contact.

## 5. Record & review
- File the incident log, the PDPC submission, and any user notice.
- Post-incident review: root cause + the fix that prevents recurrence.

> Templates (PDPC submission + user email) to be drafted with the team and lawyer before launch.
