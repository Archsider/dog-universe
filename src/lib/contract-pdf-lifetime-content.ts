// Verbatim contract text — extracted from the PDF generator so it can be
// imported both server-side (the @react-pdf renderer) and from any other
// context (the public signing page rendering, future tests).
//
// Source : verbatim contract text supplied by Mehdi, 2026-05-19 (Stephanie
// Yanik / Mama use case).  Effective Date is May 18, 2026 ; supersedes the
// prior Care Agreement of May 17, 2025.
//
// Updating any line in this file changes BOTH what the signer reads on
// screen AND what is rendered in the signed PDF — single source of truth.

export type ContentBlock =
  | { kind: 'para'; text: string }
  | { kind: 'bullets'; items: string[] };

export interface ContractSection {
  title: string;
  blocks: ContentBlock[];
}

export const LIFETIME_ARTICLES: ContractSection[] = [
  {
    title: '1. Purpose',
    blocks: [
      {
        kind: 'para',
        text: `This Agreement sets forth the terms under which the Care Provider shall provide permanent boarding, daily care, and welfare oversight for the Owner's dog, Mama (the "Dog"), at the Care Provider's facility in Marrakech, Morocco.`,
      },
    ],
  },
  {
    title: '2. The Dog',
    blocks: [
      {
        kind: 'bullets',
        items: [
          'Name: Mama',
          'Sex: Female',
          'Description: White with brown markings',
          'Status: Spayed, microchipped, fully vaccinated',
          'Date of arrival at facility: May 18, 2025',
          'Current status: Permanent resident',
        ],
      },
    ],
  },
  {
    title: '3. Ownership',
    blocks: [
      { kind: 'para', text: '3.1 Mama shall remain at all times the sole and exclusive legal property of Stephanie Yanik.' },
      { kind: 'para', text: '3.2 All veterinary records, microchip registration, and identification documents shall be maintained under the Owner\'s name.' },
      { kind: 'para', text: '3.3 The Care Provider shall not transfer ownership, rehome, surrender, or make any permanent decision concerning Mama\'s legal status without the Owner\'s prior written consent, except as expressly provided under Section 9 (Default).' },
    ],
  },
  {
    title: '4. Boarding Arrangement',
    blocks: [
      { kind: 'para', text: '4.1 Mama is admitted to the Care Provider\'s facility as a permanent resident for an indefinite period.' },
      { kind: 'para', text: '4.2 Services included in the Boarding Fee:' },
      {
        kind: 'bullets',
        items: [
          'Daily shelter, supervision, and resting accommodation',
          'Continuous access to fresh drinking water',
          'Daily exercise and socialization opportunities with compatible resident dogs',
          'General behavioral and welfare oversight by trained staff',
        ],
      },
      { kind: 'para', text: '4.3 Services NOT included in the Boarding Fee (billed separately as set forth in Section 8.4):' },
      {
        kind: 'bullets',
        items: [
          '(a) Food and nutrition (premium dry food, currently Brit Premium)',
          '(b) Grooming and bathing',
          '(c) Antiparasitic treatment (NexGard or equivalent)',
          '(d) Vaccinations and routine preventive veterinary care',
          '(e) Veterinary transport (pet taxi)',
          '(f) Any non-routine veterinary intervention, medication, or specialized treatment',
        ],
      },
    ],
  },
  {
    title: '5. Health & Veterinary Care',
    blocks: [
      { kind: 'para', text: '5.1 Routine care: The Care Provider shall ensure Mama receives annual veterinary checkups, vaccinations, and parasite prevention.' },
      { kind: 'para', text: '5.2 Non-emergency care: Any non-emergency veterinary intervention exceeding routine care shall be communicated to the Owner prior to treatment, where reasonably practicable.' },
      { kind: 'para', text: '5.3 Emergency care: In the event of a life-threatening emergency, the Care Provider is hereby pre-authorized to take all necessary veterinary measures to safeguard Mama\'s life and well-being, and shall notify the Owner as soon as reasonably possible thereafter.' },
      { kind: 'para', text: '5.4 End-of-life decisions: Any non-emergency end-of-life decision shall require the Owner\'s prior written consent, except where a licensed veterinarian determines such intervention is necessary to prevent unnecessary suffering.' },
    ],
  },
  {
    title: '6. Communication & Updates',
    blocks: [
      { kind: 'para', text: '6.1 The Owner may request updates regarding Mama (photos, videos, or written notes) at any time. The Care Provider will use reasonable efforts to respond to such requests within the same week of receipt, subject to the team\'s operational capacity and prevailing circumstances at the facility.' },
      { kind: 'para', text: '6.2 Response times may be extended in case of high operational load, staff availability, or other reasonable circumstances, without constituting a breach of this Agreement.' },
      { kind: 'para', text: '6.3 Beyond on-request updates, the Care Provider shall proactively notify the Owner of any material event concerning Mama, including but not limited to: veterinary interventions beyond routine care, notable behavioral developments, or material changes in health status.' },
      { kind: 'para', text: '6.4 On each anniversary of the Effective Date, the Care Provider shall deliver to the Owner a comprehensive annual report, including photographs, a behavioral summary, and a health overview.' },
      { kind: 'para', text: '6.5 Best-effort nature of updates: All update obligations under this Section 6 (except the Annual Report referenced in Section 6.4) are best-effort commitments and not strict obligations. Failure to respond within the timeframes set forth shall not constitute a material breach of this Agreement, nor shall it give rise to any claim for damages, indemnification, or termination.' },
    ],
  },
  {
    title: '7. Visitation',
    blocks: [
      { kind: 'para', text: '7.1 The Owner, or representatives expressly designated by the Owner in writing, may visit Mama at the Care Provider\'s facility.' },
      { kind: 'para', text: '7.2 Visits shall be scheduled with reasonable advance notice and shall take place during the Care Provider\'s business hours, subject to operational availability.' },
    ],
  },
  {
    title: '8. Financial Terms',
    blocks: [
      { kind: 'para', text: '8.1 Monthly boarding fee: The boarding fee is set at 2,500 MAD per month (the "Boarding Fee"). The Boarding Fee covers exclusively the services listed in Section 4.2.' },
      { kind: 'para', text: '8.2 Payment options: The Owner may, at her sole discretion, pay the Boarding Fee:' },
      {
        kind: 'bullets',
        items: [
          '(a) In advance, by lump sum covering multiple months (e.g., twelve (12) months in advance: 30,000 MAD); or',
          '(b) Monthly, at the beginning of each calendar month.',
        ],
      },
      { kind: 'para', text: '8.3 Annual review: The Boarding Fee may be reviewed and adjusted by the Care Provider on each anniversary of the Effective Date, with the Owner notified in writing at least thirty (30) days in advance of any change.' },
      { kind: 'para', text: '8.4 Care expenses (prepaid): The services listed in Section 4.3 are not included in the Boarding Fee. These expenses shall be funded through a prepaid care budget maintained by the Owner with the Care Provider.' },
      { kind: 'para', text: '8.5 Care budget management: The Care Provider shall provide the Owner with periodic statements detailing expenses incurred and the remaining balance.' },
      { kind: 'para', text: '8.6 Replenishment notification: When the care budget balance falls below 3,000 MAD, the Care Provider shall notify the Owner in writing (email or WhatsApp acceptable) and provide a reasonable timeframe for replenishment. The Parties agree to handle such replenishments in good faith and through open communication.' },
      { kind: 'para', text: '8.7 Continuity of care: During any period in which the care budget is depleted, the Care Provider shall continue to provide essential care to Mama. Expenses advanced by the Care Provider during such period shall be reimbursed by the Owner upon the next replenishment.' },
      { kind: 'para', text: '8.8 Extraordinary expenses: Veterinary emergencies or specialized treatments shall be communicated to the Owner for prior approval, except in life-threatening situations as set forth in Section 5.3.' },
    ],
  },
  {
    title: '9. Default & Non-Payment',
    blocks: [
      { kind: 'para', text: '9.1 In the event that any Boarding Fee remains unpaid for sixty (60) consecutive days following its due date, the Care Provider shall send a written notice (email or WhatsApp acceptable) to the Owner.' },
      { kind: 'para', text: '9.2 If, thirty (30) days after such notice, payment has not been received and no good-faith communication has been established between the Parties, the Owner shall be deemed to have abandoned Mama, and the Care Provider shall be entitled, at its sole discretion, to assume full legal ownership of Mama and to make all decisions concerning her future care, including but not limited to continued residence, adoption, or rehoming.' },
      { kind: 'para', text: '9.3 This provision exists solely to protect Mama\'s welfare in the event of prolonged unresponsiveness by the Owner, and shall be interpreted in good faith.' },
    ],
  },
  {
    title: '10. Liability',
    blocks: [
      { kind: 'para', text: '10.1 The Care Provider shall provide care with the diligence of a professional pet boarding operator.' },
      { kind: 'para', text: '10.2 The Care Provider shall not be held liable for natural illness, age-related decline, death by natural causes, or any harm resulting from circumstances beyond its reasonable control (including but not limited to acts of God, force majeure events, or pre-existing medical conditions).' },
      { kind: 'para', text: '10.3 The Care Provider maintains the right to refuse incompatible socialization or activities that could endanger Mama or other resident dogs.' },
    ],
  },
  {
    title: '11. Duration & Termination',
    blocks: [
      { kind: 'para', text: '11.1 This Agreement shall remain in effect indefinitely, for the duration of Mama\'s natural life.' },
      { kind: 'para', text: '11.2 Either Party may terminate this Agreement upon sixty (60) days\' written notice to the other Party.' },
      { kind: 'para', text: '11.3 In the event of termination by the Owner, the Owner shall arrange for the collection of Mama from the facility within thirty (30) days following the effective termination date.' },
      { kind: 'para', text: '11.4 All Boarding Fees paid in advance are non-refundable, except in the event of Mama\'s death, in which case any unused prepaid portion (calculated pro rata from the date of death) shall be refunded to the Owner within thirty (30) days.' },
    ],
  },
  {
    title: '12. General Provisions',
    blocks: [
      { kind: 'para', text: '12.1 Governing law: This Agreement shall be governed by and construed in accordance with the laws of the Kingdom of Morocco.' },
      { kind: 'para', text: '12.2 Dispute resolution: Any dispute arising from this Agreement shall first be addressed through good-faith negotiation between the Parties. Failing resolution, disputes shall be submitted to the competent courts of Marrakech, Morocco.' },
      { kind: 'para', text: '12.3 Entire agreement: This Agreement constitutes the entire understanding between the Parties and supersedes all prior agreements, including the Care Agreement dated May 17, 2025.' },
      { kind: 'para', text: '12.4 Amendments: Any amendment to this Agreement must be made in writing and signed by both Parties.' },
      { kind: 'para', text: '12.5 Severability: If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall remain in full force and effect.' },
    ],
  },
];
