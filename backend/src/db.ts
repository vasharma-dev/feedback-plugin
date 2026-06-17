// Single PrismaClient for the process.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
