// Test double for Paystack's API, used only by the e2e run. It lets us exercise the real
// initialise, redirect, verify, webhook and refund code without touching money.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
const txns = new Map(); const refunds = [];
const SECRET = "sk_test_e2e"; const APP = "http://localhost:3100";
createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const url = new URL(req.url, "http://x");
  const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && url.pathname === "/transaction/initialize") {
    const b = JSON.parse(body);
    txns.set(b.reference, { ...b, status: "abandoned", id: Math.floor(Math.random() * 1e9), paid: b.amount });
    return json({ data: { authorization_url: `http://localhost:4010/pay/${b.reference}` } });
  }
  if (url.pathname.startsWith("/pay/")) {
    const t = txns.get(url.pathname.slice(5));
    t.status = "success";
    if (url.searchParams.get("underpay")) t.paid = 100;
    res.writeHead(302, { location: t.callback_url }); return res.end();
  }
  if (url.pathname.startsWith("/transaction/verify/")) {
    const t = txns.get(decodeURIComponent(url.pathname.split("/").pop()));
    if (!t) return json({ message: "not found" }, 404);
    return json({ data: { status: t.status, amount: t.paid, currency: "NGN", id: t.id } });
  }
  if (url.pathname === "/refund") { refunds.push(JSON.parse(body)); return json({ data: { id: 777 } }); }
  if (url.pathname === "/refunds") return json(refunds);
  if (url.pathname.startsWith("/webhook-sign/")) {
    const t = txns.get(url.pathname.split("/").pop());
    t.status = "success";
    const raw = JSON.stringify({ event: "charge.success", data: { id: t.id, reference: t.reference } });
    return json({ raw, sig: createHmac("sha512", SECRET).update(raw).digest("hex") });
  }
  if (url.pathname === "/bank") return json({ data: [{ name: "Test Bank", code: "058" }] });
  if (url.pathname === "/bank/resolve") return json({ data: { account_name: "CHIDI STUDENT" } });
  if (url.pathname === "/transferrecipient") return json({ data: { recipient_code: "RCP_test" } });
  if (url.pathname === "/transfer") return json({ data: { status: "success", transfer_code: "TRF_test" } });
  if (url.pathname.startsWith("/transfer/verify/")) return json({ data: { status: "success" } });
  if (url.pathname === "/last") return json([...txns.keys()].pop());
  json({ message: "nope" }, 404);
}).listen(4010, () => console.log("fake gateway up", APP));
