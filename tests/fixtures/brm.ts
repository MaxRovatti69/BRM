/** Synthetic JSON with the field names in BRM's supplied official article. */
export function fixture() {
  return {
    reference: "TEST-001", namespace: "test-store", event: "reservation.create",
    data: {
      reference: "TEST-001", stage: "confirmed", status: "ok", draft: false,
      customer_first_name: "CLIENTE", customer_last_name: "SIMULATO",
      customer_email: "do-not-store@example.invalid", customer_phone_number: "DO-NOT-STORE",
      start_date: "2026-11-04", start_time: "09:30",
      items: [{ name: "E-BIKE", items: [] }, { name: "E-BIKE", items: [] }, { name: "CASCO", items: [] }],
      created_ts: 1793779200000, updated_ts: 1793779201000,
    },
  };
}
