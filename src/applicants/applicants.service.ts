import { Injectable, NotFoundException } from '@nestjs/common';
import { Applicant, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicantDto } from './dto/create-applicant.dto';
import { ListApplicantsQueryDto } from './dto/list-applicants-query.dto';
import { UpdateApplicantStageDto } from './dto/update-applicant-stage.dto';

export interface ApplicantsPage {
  data: Applicant[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const PRISMA_RECORD_NOT_FOUND = 'P2025';

@Injectable()
export class ApplicantsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateApplicantDto): Promise<Applicant> {
    return this.prisma.applicant.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        position: dto.position,
      },
    });
  }

  async findAll({
    page,
    limit,
    stage,
  }: ListApplicantsQueryDto): Promise<ApplicantsPage> {
    const where: Prisma.ApplicantWhereInput = stage ? { stage } : {};

    const [data, total] = await Promise.all([
      this.prisma.applicant.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.applicant.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateStage(
    id: string,
    dto: UpdateApplicantStageDto,
  ): Promise<Applicant> {
    try {
      return await this.prisma.applicant.update({
        where: { id },
        data: { stage: dto.stage },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_RECORD_NOT_FOUND
      ) {
        throw new NotFoundException(`Applicant with id ${id} was not found`);
      }
      throw error;
    }
  }
}
