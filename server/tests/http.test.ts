import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { notFound, errorHandler } from "../src/errors";
import { authLimiter, reviewLimiter } from "../src/rateLimits";

describe("error handling", () => {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/echo", (req, res) => res.json(req.body));
  app.get("/boom", () => {
    throw new Error("secret internal details");
  });
  app.use(notFound);
  app.use(errorHandler);

  it("answers unknown routes with JSON 404", async () => {
    const res = await request(app).get("/nothing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("answers broken JSON with 400", async () => {
    const res = await request(app).post("/echo").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid JSON");
  });

  it("answers oversized bodies with 413", async () => {
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(3000) }));
    expect(res.status).toBe(413);
  });

  it("hides internal error details from the client", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Server error" });
    expect(JSON.stringify(res.body)).not.toContain("secret internal details");
    spy.mockRestore();
  });
});

describe("rate limiting", () => {
  it("limits AI reviews per user, not per network", async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).userId = req.header("x-user");
      next();
    });
    app.post("/review", reviewLimiter, (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/review").set("x-user", "user-a");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post("/review").set("x-user", "user-a");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Too many AI reviews");

    // a different user on the same network is not affected
    const other = await request(app).post("/review").set("x-user", "user-b");
    expect(other.status).toBe(200);
  });

  it("counts only failed logins", async () => {
    const app = express();
    app.use(express.json());
    app.post("/auth/login", authLimiter, (req, res) => {
      if (req.body.password === "ok") res.json({ ok: true });
      else res.status(401).json({ error: "bad" });
    });

    // 25 successful logins never trigger the limit
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post("/auth/login").send({ password: "ok" });
      expect(res.status).toBe(200);
    }
    // 20 failures are allowed, the 21st is blocked
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/auth/login").send({ password: "nope" });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post("/auth/login").send({ password: "nope" });
    expect(blocked.status).toBe(429);
  });
});