import * as PrismaClient from "@prisma/client";
import { z } from "zod";

export const PostScalarFieldEnumSchema = z.nativeEnum(PrismaClient.Prisma.PostScalarFieldEnum);
