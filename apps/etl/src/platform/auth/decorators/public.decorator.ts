import { SetMetadata } from "@nestjs/common";

// Opt a route out of guards (only meaningful where a guard is applied).
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
