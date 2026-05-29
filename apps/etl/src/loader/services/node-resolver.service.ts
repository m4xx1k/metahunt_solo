import { Injectable } from "@nestjs/common";

import { NodeRepository } from "../repositories/node.repository";

export type NodeTypeValue = "ROLE" | "SKILL" | "DOMAIN";

@Injectable()
export class NodeResolverService {
  constructor(private readonly repo: NodeRepository) {}

  async resolve(type: NodeTypeValue, name: string): Promise<string> {
    const trimmed = name.trim();
    const normalized = trimmed.toLowerCase();

    const byAlias = await this.repo.findIdByAlias(type, normalized);
    if (byAlias) return byAlias;

    // resolve-or-create with race recovery: insert, else re-read by
    // canonical name (a concurrent insert won and RETURNING came back empty).
    let nodeId =
      (await this.repo.insertReturningId(type, trimmed)) ??
      (await this.repo.findIdByCanonical(type, trimmed));
    if (!nodeId) {
      throw new Error(`failed to resolve ${type} node for "${trimmed}"`);
    }

    await this.repo.linkAlias(normalized, type, nodeId);
    return nodeId;
  }
}
