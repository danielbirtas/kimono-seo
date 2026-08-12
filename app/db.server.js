import { PrismaClient } from "@prisma/client";

const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const TRANSIENT_MSG = /reach database|connection reset|ECONNRESET|ETIMEDOUT|socket hang up|connection terminated|server closed the connection|timeout expired|timed out/i;

function isTransient(err) {
  if (!err) return false;
  if (err.code && TRANSIENT_CODES.has(err.code)) return true;
  if (err.name === "PrismaClientInitializationError") return true;
  return TRANSIENT_MSG.test(String(err?.message || ""));
}

export async function withRetry(fn, { max = 3, label = "" } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= max) throw err;
      const delay = 500 * 2 ** attempt;
      console.warn(`[db.retry] ${label || "op"} attempt=${attempt + 1} delay=${delay}ms err=${err?.code || err?.message?.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}

function createClient() {
  const base = new PrismaClient({ log: ["error", "warn"] });
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query, operation, model }) {
          return withRetry(() => query(args), { label: `${model}.${operation}` });
        },
      },
    },
  });
}

const globalForPrisma = globalThis;
if (!globalForPrisma.prismaGlobal) globalForPrisma.prismaGlobal = createClient();

const prisma = globalForPrisma.prismaGlobal;
export default prisma;
