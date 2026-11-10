# CUREVO AI — PHASE 5 BETA VALIDATION PLAN

**Target Audience:** 15 Controlled Real-World Jobseekers across 3 Target Cohorts  
**Testing Environment:** Live Production Web (`https://enhancecv-orpin.vercel.app`)  
**Audit Date:** November 10, 2026  
**Auditor:** Principal AI Systems & Application Security Engineer  

---

## 1. OBJECTIVES & NON-NEGOTIABLE PRIVACY BOUNDARIES

### 1.1 Core Mission
Validate Curevo AI's end-to-end user experience, ATS audit clarity, Truth Guard safety, tailoring precision, and PDF generation with 15 real jobseekers under authentic job-search conditions.

### 1.2 Privacy-First Beta Principles
1. **Zero Candidate PII Collection:** Beta testers will **never** be asked to share their resumes, CV text, contact numbers, email addresses, employer names, or targeted job postings with Curevo AI's test administrators.
2. **Anonymous Participation:** Feedback questionnaires are indexed strictly by an anonymous Participant ID (`BETA-01` through `BETA-15`).
3. **Local Sovereignty:** All candidate resumes and drafts remain entirely within the user's browser `localStorage` and can be exported or purged at any time via the **Data Privacy & Backup** modal.

---

## 2. PARTICIPANT COHORT COMPOSITION (15 USERS)

The beta pool is stratified across three distinct user archetypes to stress-test varied career structures, technical vocabularies, and ATS scenarios:

```
+----------------------------------------------------------------------------------------------------+
|                                    15-USER BETA TESTER COHORTS                                     |
+------------------------------------+----------------------------------+----------------------------+
| Cohort 1: Technical & Data (5)     | Cohort 2: Business & Growth (5)  | Cohort 3: Career Shift (5) |
| - Senior Backend Engineer          | - Product Manager                | - Bootcamp Graduate        |
| - DevOps / Cloud Architect         | - Marketing Director             | - Retail to Tech Changer   |
| - Data Scientist / ML Engineer     | - Financial & Strategy Analyst   | - Recent University Grad   |
| - Full-Stack Developer             | - Operations / Program Lead      | - Healthcare to Tech PM    |
| - Systems / QA Engineer            | - Sales / Account Executive      | - Self-Taught Developer    |
+------------------------------------+----------------------------------+----------------------------+
```

### Cohort 1: Technical & Data Professionals (Participants 01–05)
- **Profile:** Deep technical skill inventories (languages, frameworks, cloud infrastructure, databases).
- **Test Focus:** Accuracy of technical keyword extraction, detection of adjacent vs required tools, handling of GitHub/portfolio links, and formatting of dense single-page engineering CVs.

### Cohort 2: Business & Marketing Professionals (Participants 06–10)
- **Profile:** Narrative-heavy, commercial achievements, P&L responsibility, team leadership, cross-functional collaboration.
- **Test Focus:** Qualitative achievement framing, Google XYZ bullet rewriting without artificial technical metrics, cover letter tone and executive alignment.

### Cohort 3: Career Changers & Early-Career Applicants (Participants 11–15)
- **Profile:** Limited traditional experience, transferable skills, career pivots, non-linear education, potential skill gaps.
- **Test Focus:** Truth Guard warning clarity when metrics are absent, discovery questions in ATS recommendations, handling sparse employment history without hallucinating facts.

---

## 3. USER WORKFLOW TEST SCRIPTS & SUCCESS CRITERIA

Each beta participant will execute 7 standardized tasks using their authentic resume and a real target job description:

```
  Task 1: Upload Existing CV (PDF / DOCX)
     |
     v
  Task 2: Review ATS Score & Diagnostic Findings
     |
     v
  Task 3: Enter Target Job Description (Up to 25k chars)
     |
     v
  Task 4: Tailor Resume & Review Truth Guard Flags
     |
     v
  Task 5: Generate & Customize 4-Paragraph Cover Letter
     |
     v
  Task 6: Export ATS-Safe PDF & Inspect Visual Layout
     |
     v
  Task 7: Test Browser Persistence, JSON Backup & Restore
```

### 3.1 Measurable Acceptance Criteria

| Workflow Area | Metric / Evaluation Standard | Target Success Threshold | Verification Method |
| :--- | :--- | :---: | :--- |
| **1. CV Upload & Parsing** | PDF/DOCX parsed without fatal crashes or missing sections | **>= 93% (14/15 users)** | Questionnaire confirmation |
| **2. ATS Analysis** | Clear understanding of overall score, critical issues, and quick wins | **>= 85% positive** | Likert Scale (>= 4.0 / 5) |
| **3. Job Matching & Tailoring** | Target role alignment, relevance of technical/soft keyword suggestions | **>= 85% positive** | Likert Scale (>= 4.0 / 5) |
| **4. Truth Guard Protection** | Interception of unverified claims felt helpful, truthful, and non-intrusive | **>= 90% positive** | Likert Scale (>= 4.0 / 5) |
| **5. Cover Letter Gen** | Structured 4-paragraph letter aligned with CV facts; tone appropriate | **>= 80% positive** | Likert Scale (>= 4.0 / 5) |
| **6. PDF Layout Integrity** | Flawless PDF generation (correct margins, no clipped text, single-column) | **100% (15/15 users)** | Download test confirmation |
| **7. Draft Persistence** | Closing tab and returning restores work; JSON backup downloads and restores | **>= 93% (14/15 users)** | Functional test confirmation |
| **8. Overall Usability (SUS)**| System Usability Scale equivalent score | **>= 80 / 100** | Post-test survey |

---

## 4. PARTICIPANT FEEDBACK QUESTIONNAIRE (STANDARDIZED)

*Administered via a privacy-preserving web form (or offline document). No personal data or resume text is requested.*

### Part A: Demographic & Setup
- **Participant ID:** `BETA-XX`
- **Target Job Category:** `[ ] Technical / Data  [ ] Business / Marketing  [ ] Career Changer / Graduate`
- **CV File Format Used:** `[ ] PDF  [ ] Word (.docx)  [ ] Plain Text (.txt)`
- **Device Used:** `[ ] Desktop / Laptop (macOS)  [ ] Desktop / Laptop (Windows)  [ ] Mobile / Tablet`

### Part B: Workflow Experience (1 = Strongly Disagree, 5 = Strongly Agree)

1. **CV Upload & Text Extraction:**
   - *"The upload process was fast, and the parser accurately captured my job titles, employers, and bullet points."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

2. **ATS Audit & Findings:**
   - *"The ATS score breakdown and diagnostic checks clearly explained why my CV scored as it did."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

3. **Job Description Tailoring:**
   - *"The tailored suggestions made my CV more relevant to the target job without changing my actual experience."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

4. **Truth Guard Safety:**
   - *"When the AI improved my bullets, it stayed truthful to my real background and did not fabricate numbers or skills I do not have."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

5. **Cover Letter Quality:**
   - *"The generated cover letter sounded professional, specific to the job, and easy to customize."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

6. **PDF Download & Visual Layout:**
   - *"The downloaded PDF looks polished, professional, and ready to submit to recruiters."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

7. **Privacy, Drafts & Portability:**
   - *"I appreciated that no account or login was required, and my draft was safely waiting when I refreshed the page."*  
     `[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]`  
     *Optional comment:* `___________________________________________________`

### Part C: Qualitative Feedback
- **What was the single most useful feature during your session?**  
  `____________________________________________________________________________`
- **What felt confusing, frustrating, or incomplete?**  
  `____________________________________________________________________________`
- **Would you submit this generated CV to a real job application today?** `[ ] Yes  [ ] No  [ ] With minor tweaks`

---

## 5. BETA EXECUTION TIMELINE & GO/NO-GO GATES

1. **Days 1–2 (Cohort Onboarding):** Distribute participant guidance and anonymous testing links.
2. **Days 3–5 (Active Testing):** Participants complete test tasks across desktop and mobile browsers.
3. **Days 6–7 (Reconciliation & Synthesis):** Aggregate survey responses, calculate category scores, and identify any usability bugs or Truth Guard edge cases.
4. **Beta Completion Gate:** If all 8 acceptance criteria meet or exceed target thresholds, Curevo AI is formally declared **General Public Launch Ready**.

---
*Certified beta validation plan complete.*
