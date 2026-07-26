import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AnalyticsService } from "../../platform/analytics/analytics.service";

import { FeedService } from "./feed.service";
import { RedirectController } from "./redirect.controller";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const LINK = "https://example.com/apply";

describe("RedirectController", () => {
  const getApplyLink = jest.fn();
  const applyClicked = jest.fn();
  let controller: RedirectController;

  beforeEach(async () => {
    getApplyLink.mockReset().mockResolvedValue(LINK);
    applyClicked.mockReset().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      controllers: [RedirectController],
      providers: [
        { provide: FeedService, useValue: { getApplyLink } },
        { provide: AnalyticsService, useValue: { applyClicked } },
      ],
    }).compile();
    controller = moduleRef.get(RedirectController);
  });

  it("404s when the vacancy has no apply link", async () => {
    getApplyLink.mockResolvedValue(null);
    await expect(controller.apply("v1", undefined, undefined, CHROME_UA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(applyClicked).not.toHaveBeenCalled();
  });

  it("records a real navigation tap", async () => {
    const res = await controller.apply("v1", undefined, undefined, CHROME_UA, "navigate");
    expect(res).toEqual({ url: LINK });
    expect(applyClicked).toHaveBeenCalledWith("v1", undefined, undefined);
  });

  it("still records when Sec-Fetch-Mode is absent", async () => {
    await controller.apply("v1", undefined, undefined, CHROME_UA, undefined);
    expect(applyClicked).toHaveBeenCalledWith("v1", undefined, undefined);
  });

  it("redirects a bot UA without recording", async () => {
    const res = await controller.apply("v1", undefined, undefined, BOT_UA, "navigate");
    expect(res).toEqual({ url: LINK });
    expect(applyClicked).not.toHaveBeenCalled();
  });

  it("redirects a missing UA without recording", async () => {
    const res = await controller.apply("v1", undefined, undefined, undefined);
    expect(res).toEqual({ url: LINK });
    expect(applyClicked).not.toHaveBeenCalled();
  });

  it("redirects a non-navigation fetch (prefetch/preview) without recording", async () => {
    const res = await controller.apply("v1", undefined, undefined, CHROME_UA, "cors");
    expect(res).toEqual({ url: LINK });
    expect(applyClicked).not.toHaveBeenCalled();
  });
});
