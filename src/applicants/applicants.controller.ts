import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Applicant } from '../generated/prisma/client';
import { ApplicantsPage, ApplicantsService } from './applicants.service';
import { CreateApplicantDto } from './dto/create-applicant.dto';
import { ListApplicantsQueryDto } from './dto/list-applicants-query.dto';
import { UpdateApplicantStageDto } from './dto/update-applicant-stage.dto';

@Controller('applicants')
export class ApplicantsController {
  constructor(private readonly applicantsService: ApplicantsService) {}

  @Post()
  create(@Body() dto: CreateApplicantDto): Promise<Applicant> {
    return this.applicantsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListApplicantsQueryDto): Promise<ApplicantsPage> {
    return this.applicantsService.findAll(query);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicantStageDto,
  ): Promise<Applicant> {
    return this.applicantsService.updateStage(id, dto);
  }
}
