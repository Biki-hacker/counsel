package api

import (
	"net/http"
	"time"

	"counsel/pkg/auth"
	"counsel/pkg/documents"
	"counsel/pkg/models"

	"github.com/google/uuid"
)

type DemoDocumentDef struct {
	Name     string
	MimeType string
	Content  string
}

var SyntheticContracts = []DemoDocumentDef{
	{
		Name:     "Standard_Tech_Employment_Agreement_2025.txt",
		MimeType: "text/plain",
		Content: `EMPLOYMENT AGREEMENT (ORIGINAL)

This Employment Agreement is entered into on January 15, 2025 between Apex Technologies Inc. ("Employer") and Jane Doe ("Employee").

1. POSITION AND DUTIES
Employee shall serve as Senior Software Engineer and report to the VP of Engineering.

2. COMPENSATION AND BENEFITS
Employer agrees to pay Employee an annual base salary of $160,000, payable in semi-monthly installments. Employee is eligible for an annual performance bonus of up to 15% of base salary, subject to company and individual metrics.

3. TERM AND TERMINATION
(a) Employment is at-will. Either party may terminate this agreement at any time upon thirty (30) days' prior written notice.
(b) Employer may terminate immediately for Cause, defined as gross negligence, fraud, or intentional violation of company policy.
(c) Upon termination without cause by Employer, Employee shall receive two (2) months of severance pay.

4. INTELLECTUAL PROPERTY ASSIGNMENT
All inventions, improvements, software, designs, and works of authorship created during employment and relating to Employer's business shall be the sole property of Employer.

5. NON-COMPETITION AND NON-SOLICITATION
During employment and for six (6) months following termination, Employee shall not directly solicit Employer's active customers or employees within the defined geographical market.

6. CONFIDENTIALITY
Employee agrees to maintain the strict secrecy of all proprietary technology, codebases, and financial information during and after employment.

7. GOVERNING LAW AND DISPUTE RESOLUTION
This agreement shall be governed by the laws of the State of California. Any disputes shall be resolved through good-faith mediation prior to litigation.`,
	},
	{
		Name:     "Revised_Employment_Agreement_Amendment_2026.txt",
		MimeType: "text/plain",
		Content: `EMPLOYMENT AGREEMENT (PROPOSED AMENDMENT 2026)

This Revised Agreement modifies the prior contract between Apex Technologies Inc. ("Employer") and Jane Doe ("Employee").

1. POSITION AND DUTIES
Employee continues as Principal Software Engineer.

2. COMPENSATION AND BENEFITS
Annual base salary is increased to $175,000. The annual bonus is now purely discretionary and no guaranteed percentages or metrics apply.

3. TERM AND TERMINATION
(a) Notice period for Employee resignation is increased to sixty (60) days' written notice. Employer may terminate immediately with fourteen (14) days' notice.
(b) Severance pay is conditioned upon execution of a full general waiver and release of all legal claims.

4. EXPANDED NON-COMPETITION COVENANT
For a period of twenty-four (24) months following termination, Employee shall not work for, consult with, or advise any company offering cloud orchestration, AI legal tooling, or developer productivity software worldwide.

5. INDEMNIFICATION AND LIABILITY
Employee agrees to indemnify and hold harmless Employer against any third-party claims, legal fees, or damages arising out of Employee's code contributions or alleged IP infringement, without limitation of liability.

6. MANDATORY BINDING ARBITRATION
All disputes, controversies, or claims arising out of this agreement shall be submitted to confidential, binding arbitration in New York. Employee explicitly waives any right to trial by jury or participation in class-action proceedings.`,
	},
	{
		Name:     "Commercial_Lease_Agreement_Suite_400.txt",
		MimeType: "text/plain",
		Content: `COMMERCIAL LEASE AGREEMENT

Landlord: Metro Commercial Properties LLC
Tenant: Innovation Labs Private Limited
Premises: Suite 400, 100 Tech Park Way
Term: 36 Months commencing March 1, 2025

1. RENT AND DEPOSIT
Monthly base rent: $4,500. Security deposit: $13,500 (3 months rent).

2. AUTOMATIC RENEWAL (ROLLOVER CLAUSE)
This lease shall automatically renew for an additional 24-month term unless Tenant delivers formal certified written notice of non-renewal exactly one hundred and twenty (120) days prior to the expiration date.

3. MAINTENANCE AND REPAIRS
Tenant is responsible for all HVAC maintenance, internal plumbing fixtures, and routine structural repairs exceeding $250 per incident.

4. SECURITY DEPOSIT FORFEITURE
In the event of default or early vacation, Landlord reserves the absolute right to retain the entire security deposit as liquidated damages, in addition to pursuing all accelerated rent for the remaining lease term.

5. RESTORATION
Upon vacating, Tenant must restore the premises to original shell condition, including removal of all custom wiring and partitions at Tenant's sole expense.`,
	},
	{
		Name:     "Mutual_Non_Disclosure_Agreement.txt",
		MimeType: "text/plain",
		Content: `MUTUAL NON-DISCLOSURE AGREEMENT (NDA)

Parties: Solaria Systems ("Disclosing Party") & Vertex Consulting ("Receiving Party")

1. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" includes all technical, business, financial, operational, source code, customer lists, and strategic data disclosed in tangible or intangible form, whether or not marked as confidential.

2. OBLIGATIONS OF RECEIVING PARTY
(a) Receiving Party shall protect Confidential Information with at least the same degree of care used for its own secrets, but not less than reasonable care.
(b) Receiving Party shall not reverse engineer, decompile, or copy any software samples provided.

3. PERPETUAL DURATION
The obligations of confidentiality regarding proprietary software algorithms and trade secrets shall survive indefinitely in perpetuity following the termination of discussions.

4. INJUNCTIVE RELIEF
Breach of this agreement causes irreparable harm for which monetary damages are inadequate. Disclosing Party is entitled to immediate injunctive relief without posting bond.`,
	},
}

// GET /api/v1/demo/seed
func (h *APIHandler) HandleSeedDemoData(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Not authenticated")
		return
	}

	ctx := r.Context()
	var createdDocs []*models.Document

	for _, sc := range SyntheticContracts {
		chunks := documents.ChunkDocument("doc_"+uuid.New().String(), []string{sc.Content})
		doc := &models.Document{
			ID:                  "doc_" + uuid.New().String(),
			UserID:              user.ID,
			Name:                sc.Name,
			MimeType:            sc.MimeType,
			SizeBytes:           int64(len(sc.Content)),
			PageCount:           1,
			ExtractedTextLength: len(sc.Content),
			ExtractionStatus:    "success",
			Chunks:              chunks,
			CreatedAt:           time.Now().UTC(),
		}
		_ = h.store.CreateDocument(ctx, doc)
		createdDocs = append(createdDocs, doc)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":   "Demo contracts seeded successfully into your workspace.",
		"documents": createdDocs,
	})
}
