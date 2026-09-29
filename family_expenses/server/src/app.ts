import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import { account } from "./routes/account";
import { households } from "./routes/households";
import { sync } from "./routes/sync";

export const app = new Hono();

if (process.env.NODE_ENV !== "test") app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));
app.route("/", account);
app.route("/households", households);
app.route("/sync", sync);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const code = (err.cause as { code?: string } | undefined)?.code ?? "ERROR";
    return c.json({ error: { code, message: err.message } }, err.status);
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return c.json({ error: { code: "VALIDATION", message } }, 400);
  }
  if (err instanceof SyntaxError) {
    return c.json({ error: { code: "BAD_JSON", message: "Invalid JSON body." } }, 400);
  }
  console.error(err);
  return c.json({ error: { code: "SERVER", message: "Internal server error." } }, 500);
});

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404));
