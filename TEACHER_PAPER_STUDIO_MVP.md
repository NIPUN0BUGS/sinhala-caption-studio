# GuruPaper — Sri Lankan Teacher Paper Studio (MVP prototype)

GuruPaper is developed on the `feature/teacher-paper-studio-mvp` branch and is intended to deploy as its own standalone app.

## What works in the current front-end prototype

- Paper metadata: school/institute, teacher, grade, subject, medium, term, duration, date and instructions
- Add/remove/reorder MCQ, short-answer, structured and essay questions
- Marks per question and automatic total
- MCQ options and per-question suggested answers / marking notes
- Live paper preview
- Browser print dialog for print or Save as PDF
- Word-compatible `.doc` download
- Separate suggested-answer/marking sheet toggle
- Draft persistence in the current browser's localStorage

## Current limitations — important

- There is no account system, cloud storage or cross-device synchronization in this prototype.
- It does not call an AI model and does not claim that any question is verified against a current Sri Lankan syllabus. Teachers enter and review questions.
- The Word export is Word-compatible HTML with a `.doc` extension, not a genuine Office Open XML `.docx` package.
- Subscription cards show proposed pricing only. Payment checkout is not enabled on this branch.
- There are no enforceable usage limits until the backend and plan entitlements exist. Do not advertise the proposed limits as current benefits.

## Suggested next stage

1. Validate this builder with 5–10 teachers/tutors. Ask what they currently use, where paper creation wastes time, and whether an editable Word export is enough to pay for.
2. Pick one initial niche, preferably ICT/computer studies for Grades 6–11 and O/L, then have a qualified subject teacher check sample questions against the syllabus edition in use. Keep curriculum-version labels explicit.
3. Replace localStorage draft persistence with Supabase accounts, private saved papers and server-enforced export limits.
4. Build a curated question library and syllabus-topic mapping. AI can draft questions/marking suggestions later, but require teacher review before using them in a real exam.
5. Implement PayHere recurring subscription access only after merchant approval, sandbox tests, final policies, and confirmation of live API allowlisting/network requirements.
6. Test Sinhala/Tamil fonts, page breaks, diagrams, marks totals, and exports in Chrome and Microsoft Word before charging customers.

## Proposed prices to validate, not live offers

- Free Teacher: basic builder and print/PDF export
- Teacher Pro: LKR 490/month
- School / Tuition: LKR 2,490/month (multi-user support planned)

Review price limits with teachers and budget any AI/API costs before promising unlimited generation.

## Running / preview

The app is a single static `index.html` and needs no build command. The `main` branch has not been replaced. Open the Vercel Preview URL for the `feature/teacher-paper-studio-mvp` branch when its deployment status becomes Ready.
