import { Injectable } from "@nestjs/common";

import { CompanyRepository } from "../repositories/company.repository";

@Injectable()
export class CompanyResolverService {
  constructor(private readonly repo: CompanyRepository) {}

  async resolve(sourceId: string, rawName: string): Promise<string> {
    const sourceCompanyName = rawName.trim();

    const byIdentifier = await this.repo.findIdByIdentifier(
      sourceId,
      sourceCompanyName,
    );
    if (byIdentifier) return byIdentifier;

    const slug = slugify(sourceCompanyName);

    // resolve-or-create with race recovery: try existing slug, else insert,
    // else re-read (a concurrent insert won and RETURNING came back empty).
    let companyId = await this.repo.findIdBySlug(slug);
    if (!companyId) {
      companyId =
        (await this.repo.insertReturningId(sourceCompanyName, slug)) ??
        (await this.repo.findIdBySlug(slug));
    }
    if (!companyId) {
      throw new Error(`failed to resolve company for slug "${slug}"`);
    }

    await this.repo.linkIdentifier(sourceId, sourceCompanyName, companyId);
    return companyId;
  }
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
