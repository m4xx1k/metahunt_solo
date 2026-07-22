import { BadRequestException, ParseUUIDPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { validate } from "class-validator";

import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";
import { RolesGuard } from "../../platform/auth/roles.guard";

import { RenameTaxonomyNodeDto } from "./taxonomy.contract";
import { TaxonomyController } from "./taxonomy.controller";
import { TaxonomyService } from "./taxonomy.service";

const NODE_ID = "11111111-1111-1111-1111-111111111111";

// The mutation routes are @AdminOnly(); stub the guards so this suite tests only
// controller logic (auth is covered by telegram-verify.spec + e2e).
const allow = { canActivate: () => true };

describe("TaxonomyController", () => {
  const listNodes = jest.fn();
  const renameNode = jest.fn();
  const setStatus = jest.fn();
  let controller: TaxonomyController;

  beforeEach(async () => {
    listNodes.mockReset();
    renameNode.mockReset();
    setStatus.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxonomyController],
      providers: [
        {
          provide: TaxonomyService,
          useValue: { listNodes, renameNode, setStatus },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .overrideGuard(RolesGuard)
      .useValue(allow)
      .compile();
    controller = moduleRef.get(TaxonomyController);
  });

  describe("GET /admin/taxonomy/nodes", () => {
    it("applies the default status filter (NEW + VERIFIED) when no params are given", async () => {
      listNodes.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });

      await controller.listNodes();

      expect(listNodes).toHaveBeenCalledWith({
        type: undefined,
        statuses: ["NEW", "VERIFIED"],
        q: undefined,
        minBlocked: 0,
        page: 1,
        pageSize: 50,
      });
    });

    it("parses comma-separated statuses, dedupes, and uppercases", async () => {
      listNodes.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0 });

      await controller.listNodes("ROLE", "new,verified,new", "  back  ", "3", "2", "25");

      expect(listNodes).toHaveBeenCalledWith({
        type: "ROLE",
        statuses: ["NEW", "VERIFIED"],
        q: "back",
        minBlocked: 3,
        page: 2,
        pageSize: 25,
      });
    });

    it("rejects an unknown status value", () => {
      expect(() => controller.listNodes(undefined, "PENDING")).toThrow(BadRequestException);
    });

    it("rejects pageSize beyond the cap", () => {
      expect(() =>
        controller.listNodes(undefined, undefined, undefined, undefined, "1", "5000"),
      ).toThrow(BadRequestException);
    });
  });

  describe("PATCH /admin/taxonomy/nodes/:id/rename", () => {
    it("forwards a trimmed body.name to the service", async () => {
      renameNode.mockResolvedValue({
        id: NODE_ID,
        canonicalName: "Backend Engineer",
        type: "ROLE",
        status: "NEW",
      });

      const out = await controller.renameNode(NODE_ID, { name: "Backend Engineer" });

      expect(renameNode).toHaveBeenCalledWith(NODE_ID, "Backend Engineer");
      expect(out).toMatchObject({ canonicalName: "Backend Engineer" });
    });

    it("declares boundary contracts for body and path id", async () => {
      const dto = Object.assign(new RenameTaxonomyNodeDto(), { name: 42 });

      await expect(validate(dto)).resolves.toHaveLength(1);
      await expect(new ParseUUIDPipe().transform("not-a-uuid", { type: "param" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
