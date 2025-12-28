// Single source of truth for the Numbers tool (table, columns, filters, form layout)

export const TABLE = "bank_numbers";

/**
 * COLUMNS drives:
 * - table headers + cell rendering
 * - filter inputs
 * - admin form inputs + payload mapping
 *
 * Supported props:
 * key: DB column name
 * label: UI label
 * type: "text" | "url" | "bool"
 * filter: boolean (show as filter input)
 * form: boolean (show in admin form)
 * required: boolean (admin validation)
 * mono: boolean (render value in mono font)
 * group: number (admin form grouping/layout)
 */
export const COLUMNS = [
  { key: "bank_country", label: "Bank Country", type: "text", filter: true, form: true, group: 1 },
  { key: "bankname", label: "Bankname", type: "text", filter: true, form: true, required: true, group: 1 },
  { key: "bankwebsite", label: "Bank website", type: "url", filter: true, form: true, group: 1 },
  { key: "location_name", label: "Location", type: "text", filter: true, form: true, group: 1 },

  { key: "isems_number", label: "EMS", type: "bool", filter: true, form: true, group: 2 },
  { key: "phone_number", label: "Phone", type: "text", filter: true, form: true, required: true, mono: true, group: 2 },
  { key: "fax_number", label: "Fax", type: "text", filter: true, form: true, group: 2 },

  { key: "cardtype", label: "Card type", type: "text", filter: true, form: true, group: 3 },
  { key: "service_provider_name", label: "Service provider", type: "text", filter: true, form: true, group: 3 },
  { key: "ica_number", label: "ICA", type: "text", filter: true, form: true, group: 3 },

  { key: "insurance_name", label: "Insurance name", type: "text", filter: true, form: true, group: 4 },
  { key: "insurance_number", label: "Insurance number", type: "text", filter: true, form: true, group: 4 },
  { key: "bic_number", label: "BIC", type: "text", filter: true, form: true, group: 4 },

  { key: "blz_number", label: "BLZ", type: "text", filter: true, form: true, group: 5 },
  { key: "bin_number", label: "BIN", type: "text", filter: true, form: true, group: 5 },
];
