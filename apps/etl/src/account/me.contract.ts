import { IsBoolean } from "class-validator";

// Read shapes for the logged-in user's dashboard (/me). All scoped server-side
// to the JWT user — the client never passes a user id.
export interface MeCv {
  id: string; // user_cvs.id (the ownership link, not the shared candidate)
  candidateId: string;
  label: string;
  isActive: boolean;
  role: string | null;
  seniority: string | null;
  experienceYears: number | null;
  createdAt: string;
}

export interface MeSubscription {
  id: string;
  label: string;
  isActive: boolean;
  isCv: boolean;
  createdAt: string;
}

export class UpdateSubscriptionStateDto {
  @IsBoolean()
  isActive!: boolean;
}
