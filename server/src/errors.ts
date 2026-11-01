import type { ErrorRequestHandler, RequestHandler } from "express";

// runs when no route matched
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

// runs when any middleware or route throws or calls next(err)
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // if we already started streaming (SSE), Express must close the connection itself
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
};