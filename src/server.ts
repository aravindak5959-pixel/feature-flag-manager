import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { FlagError, FlagManager, type CreateFlagInput, type UpdateFlagInput } from "./flags.js";

const manager = new FlagManager();
const port = Number(process.env.PORT ?? 3000);
const writableFields = ["description", "enabled", "rolloutPercentage", "userIds"] as const;

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 32_768) throw new FlagError("Request body must be 32 KB or smaller", 413);
    chunks.push(buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FlagError("Request body must be valid JSON", 400);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FlagError("Request body must be a JSON object", 400);
  }
  return parsed as Record<string, unknown>;
}

function pickFields(body: Record<string, unknown>): Record<string, unknown> {
  const unknownFields = Object.keys(body).filter((field) => field !== "key" && !writableFields.includes(field as (typeof writableFields)[number]));
  if (unknownFields.length) throw new FlagError(`Unknown field(s): ${unknownFields.join(", ")}`, 400);
  return Object.fromEntries(writableFields.filter((field) => field in body).map((field) => [field, body[field]]));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const method = request.method ?? "GET";
    if (method === "GET" && url.pathname === "/health") {
      send(response, 200, { status: "ok" });
      return;
    }
    if (segments.length === 1 && segments[0] === "flags") {
      if (method === "GET") return send(response, 200, { flags: manager.list() });
      if (method === "POST") {
        const body = await readJson(request);
        if (typeof body.key !== "string") throw new FlagError("key is required", 400);
        const input = { key: body.key, ...pickFields(body) } as CreateFlagInput;
        return send(response, 201, manager.create(input));
      }
    }
    if (segments.length === 2 && segments[0] === "flags") {
      const key = segments[1];
      if (method === "GET") return send(response, 200, manager.get(key));
      if (method === "PATCH") {
        const changes = pickFields(await readJson(request)) as UpdateFlagInput;
        return send(response, 200, manager.update(key, changes));
      }
      if (method === "DELETE") {
        manager.delete(key);
        return send(response, 204);
      }
    }
    if (segments.length === 3 && segments[0] === "flags" && segments[2] === "evaluate" && method === "POST") {
      const body = await readJson(request);
      if (typeof body.userId !== "string" || body.userId.length === 0) {
        throw new FlagError("userId is required and must be a non-empty string", 400);
      }
      return send(response, 200, manager.evaluate(segments[1], body.userId));
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof FlagError) return send(response, error.statusCode, { error: error.message });
    if (error instanceof URIError) return send(response, 400, { error: "Path contains invalid URL encoding" });
    console.error(error);
    send(response, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => console.log(`Feature Flag Manager listening on http://localhost:${port}`));
