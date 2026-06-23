import { Injectable } from "@nestjs/common";

import type { NodeType } from "@metahunt/database";
import { normalizeAliasName } from "../../../platform/shared/normalize-alias";
import { NodeRepository } from "../repositories/node.repository";
import type { Executor } from "../repositories/executor";

@Injectable()
export class NodeResolverService {
  constructor(private readonly repo: NodeRepository) {}

  // `executor` lets the caller run this inside the vacancy-load transaction;
  // omitted, the repository falls back to the root db handle.
  async resolve(
    type: NodeType,
    name: string,
    executor?: Executor,
  ): Promise<string> {
    const trimmed = name.trim();
    const normalized = normalizeAliasName(trimmed);

    const byAlias = await this.repo.findIdByAlias(type, normalized, executor);
    if (byAlias) return byAlias;

    // resolve-or-create with race recovery: insert, else re-read by
    // canonical name (a concurrent insert won and RETURNING came back empty).
    let nodeId =
      (await this.repo.insertReturningId(type, trimmed, executor)) ??
      (await this.repo.findIdByCanonical(type, trimmed, executor));
    if (!nodeId) {
      throw new Error(`failed to resolve ${type} node for "${trimmed}"`);
    }

    await this.repo.linkAlias(normalized, type, nodeId, executor);
    return nodeId;
  }
}
