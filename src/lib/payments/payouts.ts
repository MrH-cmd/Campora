import { asSystem } from "../db";
import { ledger, notify } from "../notify";
import { transfers } from "./providers";

/** A payout turns paid only after Paystack says so. Failed and reversed transfers go back to the balance. */
export async function settlePayout(reference: string) {
  const { status } = await transfers.verify(reference);
  await asSystem(async (db) => {
    const p = await db.one("select p.*, s.owner_id from seller_payouts p join storefronts s on s.id=p.storefront_id where p.transfer_reference=$1 for update of p", [reference]);
    if (!p || p.status === "paid") return;
    if (status === "success") {
      await db.run("update seller_payouts set status='paid', bank_reference=$2, processed_at=now() where id=$1", [p.id, reference]);
      await ledger(db, `payout:${p.id}`, "seller_payout", -Number(p.amount_kobo), { storefrontId: p.storefront_id, memo: reference });
      await notify(db, p.owner_id, "Payout received", null, "/seller/earnings");
    } else if (["failed", "reversed", "abandoned", "rejected"].includes(status)) {
      await db.run("update seller_payouts set status='failed', note=$2 where id=$1", [p.id, `Paystack: ${status}`]);
      await notify(db, p.owner_id, "Payout failed", "Your money is back in your balance.", "/seller/earnings");
    }
  });
  return status;
}
