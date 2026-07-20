# Project Gemini: Global Asset & Custody Management System (GASMAN)

**Version:** 1.0  
**Objective:** To build a transactional, chain-of-custody system for physical, digital, and intangible assets. The system ensures "No Deniability" through mandatory condition reporting, hierarchical approvals, and automated audit reminders, while integrating seamlessly with the existing Cloudflare R2 storage and foundation services.

---

## 1. Core Business Philosophy

- **The "Librarian" Principle:** An Asset has an **Owner** (Custodian). The Owner is ultimately responsible for the asset's safety, condition, and return, even when it is on loan to someone else.
- **No Deniability:** No user can claim *"I didn't get it,"* *"I forgot,"* or *"It was already broken."* Every transfer requires digital signatures (check-box confirmations), timestamped photos, and generates a permanent PDF receipt.
- **Complete Audit Trail:** Every transaction, condition report, approval, and rejection is stored immutably for the entire lifecycle of the asset.

---

## 2. System Architecture & Integration

This system is built as a **standalone Microservice** that interfaces with the existing foundation via APIs.

| Existing Foundation | Integration Strategy |
| :--- | :--- |
| **User System** | Use existing `user_id` as the primary key for Owners, Holders, and Approvers. Sync roles (Standard, Mid-Mgmt, Senior) to determine approval workflows. |
| **Messaging** | Call Messaging API to send in-app notifications, emails, and PDF receipts for transfer requests, approvals, overdue reminders, and audit dues. |
| **Task Management** | Create tasks for pending approvals, overdue returns (Day 3), and monthly audits. Tasks auto-resolve when the action is completed in the Asset system. |
| **Finance/Budget** | Link `asset_id` to budget line items to track purchased assets against financial records. |
| **Cloudflare R2** | Store all photos (Check-out/Check-in), scanned documents, and generated PDF receipts. Enforce strict folder structures and signed URLs for secure access. |

---

## 3. Data Models (Database Schema)

### A. Assets Table
*Represents an individual tracked item.*

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `name` | String | e.g., "Gold Temple Crown," "Juhu House Deed" |
| `description` | Text | Detailed description |
| `asset_type` | Enum | `PHYSICAL`, `DIGITAL`, `INTANGIBLE` |
| `category` | Enum | `INSURANCE`, `BANK`, `ENTITY_DOC`, `TEMPLE_JEWEL`, `PERSONAL_JEWEL`, `PASSPORT`, `CREDENTIALS`, `REAL_ESTATE`, `INVENTORY`, `RITUAL_ITEMS` |
| `owner_user_id` | FK (Users) | The "Librarian" ultimately responsible for this asset. |
| `is_sensitive` | Boolean | If TRUE, blocks photo uploads (for Credentials/Passwords). |
| `current_location` | String | Free text (e.g., "Vault 3," "London Office," "Google Drive Link"). |
| `is_active` | Boolean | Soft delete flag. |

### B. Asset Kits (Templates)
*For grouping multiple assets into a single transferable set (e.g., "Rudra Homa Items").*

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `name` | String | e.g., "Rudra Homa Set" |
| `owner_user_id` | FK (Users) | The Librarian responsible for the entire kit. |
| `is_recurring` | Boolean | If TRUE, used for daily/weekly vault issuances. |
| `recurring_schedule` | JSON | e.g., `{"frequency": "Daily", "return_time": "18:00"}` |

### C. Kit Components
*Links individual Assets to a Kit.*

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `kit_id` | FK (Kits) | |
| `registered_asset_id` | FK (Assets) | The specific item in the kit. |

### D. Transfer Manifests (The Transaction Parent)
*Represents a single handover event.*

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `manifest_type` | Enum | `PERSONAL_LEND`, `BULK_REGISTERED`, `HOUSE_HANDOVER` |
| `from_user_id` | FK (Users) | The giver. |
| `to_user_id` | FK (Users) | The receiver. |
| `initiated_by` | FK (Users) | The creator of the request. |
| `requires_approval` | Boolean | Auto-calculated based on the initiator's role. |
| `approved_by` | FK (Users) | Senior Manager who approved it. |
| `handover_type` | Enum | `TEMPORARY`, `PERMANENT` |
| `expected_return_date` | Timestamp | Required if `TEMPORARY`. |
| `actual_return_date` | Timestamp | Populated when the item is returned. |
| `instructions` | Text | Notes from the initiator/approver. |
| `status` | Enum | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `AWAITING_ACK`, `ACTIVE`, `COMPLETED`, `OVERDUE`, `DISPUTED` |
| `version` | Integer | Default 1. Increments for house handovers. |
| `previous_manifest_id` | FK (Self) | Links to V1, V2, V3 of a house handover. |
| `is_recurring` | Boolean | If TRUE, this manifest is used daily. |
| `pdf_receipt_r2_key` | String | Path to the generated PDF receipt stored in R2. |
| `timestamps` | Timestamps | Created, Updated, Acknowledged. |

### E. Manifest Line Items (The Contents)
*The specific items being transferred in a manifest.*

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `manifest_id` | FK (Manifests) | |
| `registered_asset_id` | FK (Assets) | NULL if unregistered (ad-hoc house items). |
| `unregistered_description` | Text | Used for ad-hoc items (e.g., "Sofa," "Fridge"). |
| `quantity` | Integer | Default 1. |
| `is_retired` | Boolean | If TRUE, item is removed from active inventory. |
| `retirement_reason` | Text | e.g., "Broken during monsoon," "Lost." |

**Condition Reporting Fields (The "No Deniability" Core):**
| Field | Type | Description |
| :--- | :--- | :--- |
| `sender_condition_notes` | Text | Condition as reported by the giver. |
| `sender_condition_photos` | JSON (Array) | R2 keys of photos uploaded by the giver. |
| `receiver_condition_notes` | Text | Condition as reported by the receiver. |
| `receiver_condition_photos` | JSON (Array) | R2 keys of photos uploaded by the receiver. |
| `condition_dispute` | Boolean | TRUE if sender/receiver conditions conflict. |

### F. Audit Schedules
*To enforce the Owner's duty to periodically verify assets on loan.*

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `asset_id` or `kit_id` | FK | The item to be audited. |
| `owner_user_id` | FK (Users) | The Librarian responsible. |
| `audit_frequency` | Enum | `MONTHLY`, `QUARTERLY`, `YEARLY` |
| `next_audit_due_date` | Timestamp | Calculated by the system. |
| `last_audit_completed` | Timestamp | Populated when the Owner clicks "Audit Done." |

---

## 4. Core Business Workflows

### A. The "No Deniability" Transfer Flow (High-Value Assets)
*For all transfers where `asset.is_sensitive = FALSE` and asset type is PHYSICAL or JEWELRY.*

1. **Sender initiates:** Selects asset/kit -> Selects Receiver -> **Mandatory:** Uploads photos & logs condition notes.
2. **Approval (if applicable):** Mid-Management requests go to Senior for approval. Senior adds conditions.
3. **Receiver Acknowledges:** Receiver views Sender's photos/notes. **Mandatory:** Receiver uploads their own photos & logs condition notes. They must check a box next to each item: *"I confirm I have received this."*
4. **Dispute Flag:** If Receiver reports "Damaged" but Sender reported "Good," the manifest is flagged `DISPUTED` and escalated to Admin.
5. **Completion:** If conditions match (or dispute is resolved), status becomes `ACTIVE`. System generates and sends a PDF receipt to both parties.

### B. Kit & Recurring Transfers (The Temple Vault Flow)
1. Admin creates a "Rudra Homa" Kit and links 50 individual Asset IDs to it.
2. Vault Owner selects the Kit, selects the Receiver, checks `is_recurring = TRUE`, and sets the schedule (e.g., Daily return by 6 PM).
3. **Daily Automation:**
   - Morning: System sends a reminder to the Receiver to collect the kit.
   - Evening: System sends a reminder to the Receiver to return the kit.
   - Receiver uses the same Manifest to "Return" the kit, triggering a new Condition Check-In.

### C. Bulk & House Handover (Unaccounted Items)
1. User selects `HOUSE_HANDOVER`.
2. **Ad-hoc List:** User pastes a text list (e.g., "Fridge, AC, Sofa, 5 Chairs") into a text area. The system splits this into unregistered Line Items.
3. **Versioning:** If the house had a previous manifest (V1), the system clones V1's items. The new user can:
   - **Add:** New items (e.g., "New Microwave").
   - **Retire:** Broken items (e.g., "Old Sofa" -> Reason: "Broken, disposed of"). Retired items disappear from future versions.
4. **Group Photos:** Instead of 50 individual photos, the Sender uploads a room scan/group photo. The Receiver uploads a group photo to confirm the general state.

---

## 5. The "Librarian" (Owner) Dashboard

- **Currently Loaned Out:** Lists all assets/kits the Owner is responsible for that are currently with other users. Shows: *Item, Holder, Due Date, Days Overdue.*
- **Pending Returns:** Assets that have been sent back by the Holder but are awaiting the Owner's inspection and final acceptance.
- **Disputes:** List of transfers where `condition_dispute = TRUE`. Shows Sender vs. Receiver photos side-by-side for mediation.
- **Audit Due:** Monthly reminder to contact all Holders and verify the condition of loaned items. Clicking "Audit" logs the date and resets the schedule.

---

## 6. Automated Engine: Nags, Overdues & Escalations

| Trigger | Action |
| :--- | :--- |
| **24 hours before return date** | Send in-app message: *"Reminder: Return [Asset] to [Owner] tomorrow."* |
| **1 day overdue** | Send in-app message to Holder. |
| **3 days overdue** | Send Email + **Create a Task** assigned to the Holder's Team Lead. |
| **7 days overdue** | Flag Asset as `MISSING` in searches. Notify Senior Management. |
| **Monthly Audit Due** | **Create a Task** for the Owner: *"Verify [Asset/Kit] with [Holder]."* Sends an in-app message to the Owner. |
| **Owner Offboarding** | **Hard Stop:** System checks if Owner has active loans. If yes, offboarding is blocked until all assets are returned OR Ownership is transferred (requires Senior Approval). |

---

## 7. Access Control (RBAC)

| Role | Permissions |
| :--- | :--- |
| **Standard Volunteer** | - Can view/transfer only assets they hold.<br>- Can initiate PERSONAL_LEND (no approval) for their own items.<br>- Must accept incoming transfers with a condition report. |
| **Mid-Management** | - Can initiate transfers for any asset in their department.<br>- Can initiate BULK and HOUSE_HANDOVER transfers.<br>- **Requires Senior Approval** for all transfers they initiate. |
| **Senior Management** | - Can initiate transfers for ANY asset globally.<br>- **No approval required** (bypass).<br>- Can approve/reject Mid-Management requests.<br>- Can mediate disputes. |
| **Admin/Auditor** | - Read-only access to all assets, logs, and condition reports.<br>- Can generate reports for insurance and bank audits. |

---

## 8. Cloudflare R2 Storage Strategy

- **Sensitive Assets:** Upload button is hidden. No photos stored.
- **Standard Assets:** 
  - Folder Structure: `/assets/{asset_id}/checkout_{timestamp}/photo1.jpg`
  - Folder Structure: `/assets/{asset_id}/checkin_{timestamp}/photo1.jpg`
- **Manifests (House Handovers):** `/manifests/{manifest_id}/room_scan.jpg`
- **PDF Receipts:** `/receipts/{manifest_id}.pdf`
- **Security:** All R2 URLs are generated as **Signed URLs** with a 1-hour expiry to prevent public scraping.

---

## 9. Required Integrations with Existing Foundation

| Foundation Feature | Required Action |
| :--- | :--- |
| **User Roles** | Add `role` field (`standard`, `mid_mgmt`, `senior`). Approval logic reads this. |
| **Notifications** | Build an API endpoint to send rich notifications with deep links to the Manifest (Accept/Reject/Approve screens). |
| **Task System** | When the system creates an "Overdue" or "Audit" task, it must pass `entity_type: "ASSET"` and `entity_id: manifest_id` so the task links back to the Asset Manager. |
| **Finance** | Add an optional `asset_id` foreign key to your Budget/Expense lines so the finance team can see if an insured asset is currently "loaned out" or "in the vault." |

---

## 10. Developer Implementation Phases (MVP to V2)

- **Phase 1 (Core Transactions):** Build `Assets`, `Manifests`, and `Line Items`. Support PERSONAL_LEND and BULK_REGISTERED transfers with basic Accept/Reject.
- **Phase 2 (Approvals & Kits):** Add `role` checks for Mid/Senior Mgmt. Build the `Kits` module to group assets for quick transfer.
- **Phase 3 (Conditions & Photos):** Integrate R2 uploads. Enforce mandatory Sender/Receiver condition notes and photos. Build the Dispute flagging logic.
- **Phase 4 (House Handover & Versioning):** Build the ad-hoc text list parser, the Clone/Version logic, and the "Retire" function.
- **Phase 5 (PDF Receipts & Notifications):** Generate PDFs using a HTML-to-PDF worker. Integrate with the Messaging API to send receipts.
- **Phase 6 (Audit Engine & Overdue Nags):** Build the Cron Jobs for daily nags, overdue escalations, and monthly audit task creation.

---

## 11. Success Metrics (Definition of "Done")

1. **Zero "I forgot" excuses:** Every user has a timestamped PDF receipt for every item they have ever held.
2. **Complete Chain of Custody:** Admin can query by Asset ID or User ID and see a chronological timeline of every holder, including condition notes at each transfer.
3. **Owner Accountability:** No Owner can offboard the organization without clearing their loaned inventory or formally transferring ownership of their assets.
4. **Dispute Resolution:** If an item comes back broken, the system shows exactly when the condition changed (Check-out vs. Check-in) and which user was holding it at that time.
5. **Searchability:** Users can search by asset name, category (Insurance/Bank/Temple), user, status (Overdue/Missing), and location.
