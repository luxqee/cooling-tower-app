import type { TemplateSections } from "./types";

// Every statutory field ID is prefixed with this string. TemplateBuilder's
// admin-editable custom fields are rejected (client- and server-side) if
// their ID starts with this prefix, so an admin can never accidentally
// shadow or corrupt the legally-mandated content below.
export const RESERVED_FIELD_PREFIX = "statutory_";

// SWMS content grounded in WHS Regulation 2011 (Qld) s299 (identify the
// high-risk work category, describe hazards/controls, describe how controls
// are implemented/monitored/reviewed) and an official regulator-published
// SWMS template (WorkSafe ACT, built on the same model WHS Regulation
// Queensland adopted — worksafe.qld.gov.au itself blocked direct fetching
// during research). NOT reviewed by a WHS professional — see the disclaimer
// rendered alongside this content in generatePdf.ts.
export const SWMS_STATUTORY_SECTIONS: TemplateSections = [
  {
    id: "statutory_details",
    title: "Details",
    fields: [
      { id: "statutory_pcbu_name", label: "Person Conducting a Business or Undertaking (PCBU) — name", type: "text", required: true },
      { id: "statutory_pcbu_contact", label: "PCBU contact details", type: "text", required: true },
      { id: "statutory_pc_name", label: "Principal Contractor — name (if applicable)", type: "text", required: false },
      { id: "statutory_pc_contact", label: "Principal Contractor — contact details (if applicable)", type: "text", required: false },
      { id: "statutory_works_manager", label: "Works Manager — name", type: "text", required: true },
      { id: "statutory_works_manager_phone", label: "Works Manager — contact phone", type: "text", required: true },
      { id: "statutory_work_activity", label: "Work activity", type: "textarea", required: true },
      { id: "statutory_workplace_location", label: "Workplace location", type: "text", required: true },
      { id: "statutory_date_provided_to_pc", label: "Date SWMS provided to Principal Contractor (if applicable)", type: "date", required: false },
    ],
  },
  {
    id: "statutory_hrcw",
    title: "High Risk Construction Work",
    fields: [
      { id: "statutory_hrcw_falling", label: "Risk of a person falling more than 2 metres", type: "checkbox", required: false },
      { id: "statutory_hrcw_telecom_tower", label: "Work on a telecommunication tower", type: "checkbox", required: false },
      { id: "statutory_hrcw_demolition", label: "Demolition of a load-bearing structure", type: "checkbox", required: false },
      { id: "statutory_hrcw_asbestos", label: "Likely to involve disturbing asbestos", type: "checkbox", required: false },
      { id: "statutory_hrcw_temp_support", label: "Temporary load-bearing support for structural alterations or repairs", type: "checkbox", required: false },
      { id: "statutory_hrcw_confined_space", label: "Work in or near a confined space", type: "checkbox", required: false },
      { id: "statutory_hrcw_trench", label: "Work in or near a shaft or trench deeper than 1.5 metres, or a tunnel", type: "checkbox", required: false },
      { id: "statutory_hrcw_explosives", label: "Use of explosives", type: "checkbox", required: false },
      { id: "statutory_hrcw_gas", label: "Work on or near pressurised gas mains or piping", type: "checkbox", required: false },
      { id: "statutory_hrcw_chemical_lines", label: "Work on or near chemical, fuel or refrigerant lines", type: "checkbox", required: false },
      { id: "statutory_hrcw_electrical", label: "Work on or near energised electrical installations or services", type: "checkbox", required: false },
      { id: "statutory_hrcw_atmosphere", label: "Work in an area that may have a contaminated or flammable atmosphere", type: "checkbox", required: false },
      { id: "statutory_hrcw_concrete", label: "Tilt-up or precast concrete elements", type: "checkbox", required: false },
      { id: "statutory_hrcw_traffic", label: "Work on, in or adjacent to a road, railway, shipping lane, or other traffic corridor in use by traffic other than pedestrians", type: "checkbox", required: false },
      { id: "statutory_hrcw_mobile_plant", label: "Work in an area with movement of powered mobile plant", type: "checkbox", required: false },
      { id: "statutory_hrcw_temperature", label: "Work in areas with artificial extremes of temperature", type: "checkbox", required: false },
      { id: "statutory_hrcw_water", label: "Work in or near water or other liquid that involves a risk of drowning", type: "checkbox", required: false },
      { id: "statutory_hrcw_diving", label: "Diving work", type: "checkbox", required: false },
    ],
  },
  {
    id: "statutory_risk_assessment",
    title: "Risk Assessment",
    fields: [
      {
        id: "statutory_task_table",
        label: "Tasks, hazards, and control measures",
        type: "table",
        required: true,
        columns: [
          { id: "task", label: "Task" },
          { id: "hazards", label: "Hazards & Risks" },
          { id: "controls", label: "Control Measures" },
        ],
      },
    ],
  },
  {
    id: "statutory_compliance_review",
    title: "Compliance & Review",
    fields: [
      { id: "statutory_compliance_person", label: "Person responsible for ensuring compliance with this SWMS", type: "text", required: true },
      { id: "statutory_compliance_measures", label: "What measures are in place to ensure compliance", type: "textarea", required: true },
      { id: "statutory_review_person", label: "Person responsible for reviewing SWMS control measures", type: "text", required: true },
      { id: "statutory_review_method", label: "How control measures will be reviewed", type: "textarea", required: true },
      { id: "statutory_review_date", label: "Review date", type: "date", required: true },
    ],
  },
  {
    id: "statutory_signoff",
    title: "Sign-off",
    fields: [
      { id: "statutory_worker_signatures", label: "Workers", type: "signature-list", required: true },
      { id: "statutory_date_received_by_workers", label: "Date SWMS received by workers", type: "date", required: false },
      { id: "statutory_reviewer_signature", label: "Reviewer name & signature", type: "signature", required: false },
    ],
  },
];

// WHS Management Plan content grounded in WorkSafe QLD guidance on
// principal-contractor obligations for construction projects (mandatory
// once project value exceeds $250,000): project details, named
// health-and-safety-responsible persons, PCBU consultation/cooperation/
// coordination arrangements, incident management arrangements,
// site-specific rules, and sign-off by the Principal Contractor. NOT
// reviewed by a WHS professional — see the disclaimer rendered alongside
// this content in generatePdf.ts.
export const WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS: TemplateSections = [
  {
    id: "statutory_project_details",
    title: "Project Details",
    fields: [
      { id: "statutory_client_name", label: "Client name", type: "text", required: true },
      { id: "statutory_whsmp_pc_name", label: "Principal Contractor — name", type: "text", required: true },
      { id: "statutory_major_subcontractors", label: "Major subcontractors", type: "textarea", required: false },
      { id: "statutory_project_location", label: "Project location(s)", type: "text", required: true },
      { id: "statutory_start_date", label: "Anticipated start date", type: "date", required: true },
      { id: "statutory_duration", label: "Anticipated duration", type: "text", required: true },
      { id: "statutory_scope_of_works", label: "Scope of works", type: "textarea", required: true },
    ],
  },
  {
    id: "statutory_responsible_persons",
    title: "Responsible Persons",
    fields: [
      {
        id: "statutory_responsible_persons_table",
        label: "Persons with specific WHS responsibilities on this project",
        type: "table",
        required: true,
        columns: [
          { id: "name", label: "Name" },
          { id: "position", label: "Position" },
          { id: "responsibility", label: "WHS Responsibility" },
        ],
      },
    ],
  },
  {
    id: "statutory_consultation",
    title: "Consultation, Cooperation & Coordination",
    fields: [
      { id: "statutory_consultation_arrangements", label: "Arrangements between persons conducting a business or undertaking at the workplace for consultation, cooperation, and coordination of WHS duties", type: "textarea", required: true },
    ],
  },
  {
    id: "statutory_incident_management",
    title: "Incident Management",
    fields: [
      { id: "statutory_incident_management", label: "Arrangements for managing WHS incidents that occur", type: "textarea", required: true },
    ],
  },
  {
    id: "statutory_site_rules",
    title: "Site-Specific Rules",
    fields: [
      { id: "statutory_site_rules", label: "Site-specific health and safety rules, and how all persons at the workplace are informed of them", type: "textarea", required: true },
    ],
  },
  {
    id: "statutory_whsmp_signoff",
    title: "Sign-off",
    fields: [
      { id: "statutory_pc_signature", label: "Principal Contractor name & signature", type: "signature", required: true },
      { id: "statutory_pc_signature_date", label: "Date signed", type: "date", required: true },
      { id: "statutory_review_provisions", label: "Review and revision provisions", type: "textarea", required: true },
    ],
  },
];

/**
 * Returns the fixed, legally-mandated sections for a document type, or null
 * for types with no statutory core (JSA, Induction — fully admin-editable).
 */
export function getStatutorySections(templateType: string): TemplateSections | null {
  if (templateType === "swms") return SWMS_STATUTORY_SECTIONS;
  if (templateType === "whs_management_plan") return WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS;
  return null;
}

/**
 * The full section list a document of this type should render: statutory
 * (locked) sections first, then the template's admin-editable custom
 * sections. Shared by the fill-out form and the PDF generator so they never
 * drift apart.
 */
export function mergeSections(templateType: string, customSections: TemplateSections): TemplateSections {
  const statutory = getStatutorySections(templateType);
  return statutory ? [...statutory, ...customSections] : customSections;
}

/** True if a document type has legally-mandated content that must carry the WHS disclaimer. */
export function hasStatutoryContent(templateType: string): boolean {
  return getStatutorySections(templateType) !== null;
}
