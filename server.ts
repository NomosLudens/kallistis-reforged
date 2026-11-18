import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

type ProfileRole = "jogador" | "mestre";
type Profile = {
  id: string;
  name: string;
  role: ProfileRole;
  created_at: string;
};

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const rootDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(rootDir, "data");
const databasePath = join(dataDir, "kallistis.sqlite");
const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);

await mkdir(dataDir, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
database.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  );
`);

const migration = await readFile(join(rootDir, "db/migrations/001_profiles.sql"), "utf8");
const migrationApplied = database
  .prepare("SELECT version FROM schema_migrations WHERE version = ?")
  .get(1);
if (!migrationApplied) {
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(migration);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(1, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 8_192) throw new ApiError(413, "A solicitação excede o limite de 8 KB.");
    chunks.push(bytes);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "O corpo da solicitação precisa ser JSON válido.");
  }
}

async function serveFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
): Promise<void> {
  const contents = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
  });
  response.end(contents);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/api/profiles") {
    if (request.method === "GET") {
      const profiles = database
        .prepare("SELECT id, name, role, created_at FROM profiles ORDER BY created_at, name")
        .all() as Profile[];
      sendJson(response, 200, { profiles });
      return;
    }

    if (request.method === "POST") {
      if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        throw new ApiError(415, "Use uma solicitação application/json.");
      }

      const body = await readJson(request);
      if (typeof body !== "object" || body === null) {
        throw new ApiError(400, "Informe nome e tipo do perfil.");
      }

      const input = body as Record<string, unknown>;
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const role = input.role;
      if (!name || name.length > 40) {
        throw new ApiError(422, "O nome precisa ter entre 1 e 40 caracteres.");
      }
      if (role !== "jogador" && role !== "mestre") {
        throw new ApiError(422, "Escolha jogador ou mestre como tipo do perfil.");
      }

      const id = randomUUID();
      const createdAt = new Date().toISOString();
      try {
        database
          .prepare("INSERT INTO profiles (id, name, role, created_at) VALUES (?, ?, ?, ?)")
          .run(id, name, role satisfies ProfileRole, createdAt);
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed: profiles.name")) {
          throw new ApiError(409, "Já existe um perfil com esse nome.");
        }
        throw error;
      }

      sendJson(response, 201, {
        profile: { id, name, role, created_at: createdAt } satisfies Profile,
      });
      return;
    }

    response.setHeader("allow", "GET, POST");
    throw new ApiError(405, "Método não permitido.");
  }

  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    throw new ApiError(405, "Método não permitido.");
  }

  const staticFiles: Record<string, { path: string; type: string }> = {
    "/": { path: "index.html", type: "text/html; charset=utf-8" },
    "/app.js": { path: "app.js", type: "text/javascript; charset=utf-8" },
    "/styles.css": { path: "styles.css", type: "text/css; charset=utf-8" },
    "/brand-assets/kallistis-canon-crystal.webp": {
      path: "brand-assets/kallistis-canon-crystal.webp",
      type: "image/webp",
    },
  };
  const asset = staticFiles[url.pathname];
  if (!asset) {
    sendJson(response, 404, { error: "not_found", message: "Esta rota não existe." });
    return;
  }
  await serveFile(response, join(rootDir, "public", asset.path), asset.type);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (error instanceof ApiError) {
      sendJson(response, error.status, { error: "request_failed", message: error.message });
      return;
    }
    console.error("Falha ao processar a solicitação:", error);
    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "internal_error",
        message: "Não foi possível concluir a operação no banco local.",
      });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  });
});

server.listen(port, host, () => {
  console.log(`KALLÍSTIS — REFORGED disponível em http://${host}:${port}`);
  console.log(`Banco SQLite local: ${databasePath}`);
  console.log("A seleção aberta de perfis não é um controle de acesso.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
