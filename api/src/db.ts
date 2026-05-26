import { PrismaClient } from "@prisma/client";

/**
 * Singleton do PrismaClient. Em dev, o tsx recarrega módulos a cada save;
 * guardar no globalThis evita abrir uma conexão nova a cada hot-reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
