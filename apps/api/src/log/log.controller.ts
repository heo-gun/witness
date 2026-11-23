import { Controller, Get, Header, HttpStatus, Query, Res } from "@nestjs/common";
import type { Response } from "express";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ValidationPipe requires runtime DTO classes.
import {
  ConsistencyQueryDto,
  EntriesQueryDto,
  HistoryQueryDto,
  InclusionQueryDto,
} from "./dto/log-query.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest requires runtime decorator metadata.
import { LogReadService } from "./log-read.service.js";

@Controller("log")
export class LogController {
  constructor(private readonly log: LogReadService) {}

  @Get("sth")
  @Header("Cache-Control", "no-store")
  async latest(@Res({ passthrough: true }) response: Response) {
    const head = await this.log.latest();
    if (!head) response.status(HttpStatus.NO_CONTENT);
    return head;
  }

  @Get("sth/history")
  @Header("Cache-Control", "no-store")
  history(@Query() query: HistoryQueryDto) {
    return this.log.history(query.before);
  }

  @Get("entries")
  entries(@Query() query: EntriesQueryDto) {
    return this.log.entries(query.start, query.end);
  }

  @Get("proof/inclusion")
  inclusion(@Query() query: InclusionQueryDto) {
    return this.log.inclusion(query.leafIndex, query.treeSize);
  }

  @Get("proof/consistency")
  consistency(@Query() query: ConsistencyQueryDto) {
    return this.log.consistency(query.first, query.second);
  }
}
