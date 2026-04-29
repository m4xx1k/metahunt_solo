import { Controller, Get, HttpCode } from "@nestjs/common";
import { RssSchedulerService } from "./rss-scheduler.service";

@Controller("rss")
export class RssController {
  constructor(private readonly scheduler: RssSchedulerService) {}

  @Get()
  @HttpCode(202)
  triggerAll(): { triggered: "all" } {
    void this.scheduler.ingestAll();
    return { triggered: "all" };
  }
}
