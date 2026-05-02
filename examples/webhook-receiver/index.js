import http from "node:http";
import { verifyWebhookSignature } from "@behalfid/sdk";

const port = Number(process.env.PORT || 4000);
const secret = process.env.BEHALFID_WEBHOOK_SECRET;

if (!secret) {
  console.error("BEHALFID_WEBHOOK_SECRET is required.");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end("Method Not Allowed");
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks);
  const valid = await verifyWebhookSignature({
    secret,
    payload: rawBody,
    timestamp: req.headers["behalfid-timestamp"],
    signature: req.headers["behalfid-signature"]
  });

  if (!valid) {
    res.writeHead(401).end("Invalid signature");
    return;
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  console.log(`Received ${event.type} (${event.eventId})`);
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ received: true }));
});

server.listen(port, () => {
  console.log(`BehalfID webhook receiver listening on http://localhost:${port}`);
});
